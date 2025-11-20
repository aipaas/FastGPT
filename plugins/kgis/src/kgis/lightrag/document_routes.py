"""FastAPI routes for document insertion operations."""

import time
import traceback

import structlog
from fastapi import APIRouter, HTTPException, status

from kgis.lightrag.manager import LightRAGInstance, get_manager
from kgis.lightrag.types import (
    DocStatusResponse,
    InsertDocumentsRequest,
    InsertDocumentsResponse,
    InsertionStatusRequest,
    TrackStatusResponse,
    format_datetime,
)

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/api/lightrag/documents", tags=["documents"])


async def _get_or_create_instance(request: InsertDocumentsRequest) -> LightRAGInstance:
    """Get or create LightRAG instance based on request."""
    manager = await get_manager()

    # Try to find existing instance first
    instance = await manager.find_instance(
        workspace_id=request.workspace_id,
        llm_model=request.llm_model,
        embedding_model=request.embedding_model,
        rerank_model=request.rerank_model,
    )

    if instance is None:
        # Create new instance if not found
        logger.info(
            "instance_not_found_creating_new",
            workspace_id=request.workspace_id,
            llm_model=request.llm_model,
            embedding_model=request.embedding_model,
        )

        from kgis.lightrag.types import CreateInstanceRequest

        create_request = CreateInstanceRequest(
            workspace_id=request.workspace_id,
            llm_model=request.llm_model,
            embedding_model=request.embedding_model,
            rerank_model=request.rerank_model,
        )

        instance_id = await manager.create_instance(create_request)
        instance = await manager.get_instance(instance_id)

        if instance is None:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create LightRAG instance",
            )

    return instance


@router.post("/insert", status_code=status.HTTP_200_OK)
async def insert_documents_sync(request: InsertDocumentsRequest) -> InsertDocumentsResponse:
    """Insert documents synchronously into LightRAG."""
    start_time = time.time()

    try:
        # Get or create instance
        instance = await _get_or_create_instance(request)

        # Acquire instance
        await instance.acquire()

        try:
            # Prepare insertion parameters
            insert_params = {
                "input": request.input,
                "split_by_character": request.split_by_character,
                "split_by_character_only": request.split_by_character_only,
            }

            if request.ids is not None:
                insert_params["ids"] = request.ids
            if request.track_id is not None:
                insert_params["track_id"] = request.track_id

            logger.info(
                "insert_documents_start",
                instance_id=instance.instance_id,
                workspace_id=request.workspace_id,
                track_id=request.track_id,
                input_type=type(request.input).__name__,
            )

            # Perform insertion
            returned_track_id = await instance.lightrag.ainsert(**insert_params)

            processing_time = (time.time() - start_time) * 1000

            logger.info(
                "insert_documents_success",
                instance_id=instance.instance_id,
                workspace_id=request.workspace_id,
                track_id=returned_track_id,
                processing_time_ms=round(processing_time, 2),
            )

            return InsertDocumentsResponse(
                success=True,
                message="Documents inserted successfully",
                inserted_count=1 if isinstance(request.input, str) else len(request.input),
                track_id=returned_track_id,
                processing_time_ms=round(processing_time, 2),
            )

        finally:
            # Always release instance
            await instance.release()

    except Exception as e:
        processing_time = (time.time() - start_time) * 1000
        logger.error(
            "insert_documents_error",
            workspace_id=request.workspace_id,
            track_id=request.track_id,
            error=str(e),
            processing_time_ms=round(processing_time, 2),
        )

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to insert documents: {str(e)}",
        )


@router.post("/status", status_code=status.HTTP_200_OK)
async def get_insertion_status(request: InsertionStatusRequest) -> TrackStatusResponse:
    """Get status of document insertion operation."""
    try:
        # Validate track_id
        if not request.track_id or not request.track_id.strip():
            raise HTTPException(status_code=400, detail="Track ID cannot be empty")

        track_id = request.track_id.strip()

        # Get instance
        instance = await _get_or_create_instance(
            InsertDocumentsRequest(
                workspace_id=request.workspace_id,
                llm_model=request.llm_model,
                embedding_model=request.embedding_model,
                rerank_model=request.rerank_model,
                input="",  # Empty input for instance lookup
            )
        )

        logger.info(
            "query_insertion_status",
            instance_id=instance.instance_id,
            workspace_id=request.workspace_id,
            track_id=request.track_id,
        )

        # Get documents by track_id from LightRAG
        docs_by_track_id = await instance.lightrag.aget_docs_by_track_id(track_id)

        # Convert to response format
        documents = []
        status_summary: dict[str, int] = {}

        for doc_id, doc_status in docs_by_track_id.items():
            documents.append(
                DocStatusResponse(
                    id=doc_id,
                    content_summary=doc_status.content_summary,
                    content_length=doc_status.content_length,
                    status=doc_status.status,
                    created_at=format_datetime(doc_status.created_at) or "",
                    updated_at=format_datetime(doc_status.updated_at) or "",
                    track_id=doc_status.track_id,
                    chunks_count=doc_status.chunks_count,
                    error_msg=doc_status.error_msg,
                    metadata=doc_status.metadata,
                    file_path=doc_status.file_path,
                )
            )

            # Build status summary
            # Handle both DocStatus enum and string cases for robust deserialization
            status_key = str(doc_status.status)
            status_summary[status_key] = status_summary.get(status_key, 0) + 1

        return TrackStatusResponse(
            track_id=track_id,
            documents=documents,
            total_count=len(documents),
            status_summary=status_summary,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting track status for {request.track_id}: {str(e)}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))
