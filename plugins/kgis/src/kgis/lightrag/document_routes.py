"""FastAPI routes for document insertion operations."""

import asyncio
import time
import traceback
from typing import Any, Dict, List, Optional, Tuple

import structlog
from fastapi import APIRouter, HTTPException, status
from lightrag.base import QueryParam

from kgis.lightrag.lightrag_types import (
    DataRetrievalRequest,
    DataRetrievalResponse,
    DeleteDocumentRequest,
    DeleteDocumentResponse,
    DocStatusResponse,
    InsertDocumentsRequest,
    InsertDocumentsResponse,
    InsertionStatusRequest,
    PaginationInfo,
    TrackStatusResponse,
    format_datetime,
)
from kgis.lightrag.manager import LightRAGInstance, get_manager

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/api/lightrag/documents", tags=["documents"])


async def _get_or_create_instance_by_params(
    workspace_id: str,
    llm_model: str,
    embedding_model: str,
    rerank_model: Optional[str] = None,
) -> LightRAGInstance:
    """Get or create LightRAG instance by parameters."""
    manager = await get_manager()

    # Try to find existing instance first
    instance = await manager.find_instance(
        workspace_id=workspace_id,
        llm_model=llm_model,
        embedding_model=embedding_model,
        rerank_model=rerank_model,
    )

    if instance is None:
        # Create new instance if not found
        logger.info(
            "instance_not_found_creating_new",
            workspace_id=workspace_id,
            llm_model=llm_model,
            embedding_model=embedding_model,
        )

        from kgis.lightrag.lightrag_types import CreateInstanceRequest

        create_request = CreateInstanceRequest(
            workspace_id=workspace_id,
            llm_model=llm_model,
            embedding_model=embedding_model,
            rerank_model=rerank_model,
        )

        instance_id = await manager.create_instance(create_request)
        instance = await manager.get_instance(instance_id)

        if instance is None:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create LightRAG instance",
            )

    return instance


async def _get_or_create_instance(request: InsertDocumentsRequest) -> LightRAGInstance:
    """Get or create LightRAG instance based on insert request."""
    return await _get_or_create_instance_by_params(
        workspace_id=request.workspace_id,
        llm_model=request.llm_model,
        embedding_model=request.embedding_model,
        rerank_model=request.rerank_model,
    )


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
            if request.file_paths is not None:
                insert_params["file_paths"] = request.file_paths
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


@router.delete("/delete", status_code=status.HTTP_200_OK)
async def delete_document(request: DeleteDocumentRequest) -> DeleteDocumentResponse:
    """Delete a document from LightRAG."""
    start_time = time.time()

    try:
        # Get or create instance
        instance = await _get_or_create_instance_by_params(
            workspace_id=request.workspace_id,
            llm_model=request.llm_model,
            embedding_model=request.embedding_model,
            rerank_model=request.rerank_model,
        )

        # Acquire instance
        await instance.acquire()

        try:
            logger.info(
                "delete_document_start",
                instance_id=instance.instance_id,
                workspace_id=request.workspace_id,
                doc_id=request.doc_id,
                delete_llm_cache=request.delete_llm_cache,
            )

            # Perform deletion using LightRAG's adelete_by_doc_id method
            deletion_result = await instance.lightrag.adelete_by_doc_id(
                doc_id=request.doc_id, delete_llm_cache=request.delete_llm_cache
            )

            processing_time = (time.time() - start_time) * 1000

            # Map LightRAG deletion result to our response format
            success = deletion_result.status == "success"
            response_status = deletion_result.status
            file_path = getattr(deletion_result, "file_path", None)

            logger.info(
                "delete_document_success",
                instance_id=instance.instance_id,
                workspace_id=request.workspace_id,
                doc_id=request.doc_id,
                status=response_status,
                processing_time_ms=round(processing_time, 2),
            )

            return DeleteDocumentResponse(
                success=success,
                message=deletion_result.message,
                doc_id=request.doc_id,
                status=response_status,
                file_path=file_path,
                processing_time_ms=round(processing_time, 2),
            )

        finally:
            # Always release instance
            await instance.release()

    except Exception as e:
        processing_time = (time.time() - start_time) * 1000
        logger.error(
            "delete_document_error",
            workspace_id=request.workspace_id,
            doc_id=request.doc_id,
            error=str(e),
            processing_time_ms=round(processing_time, 2),
        )

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete document: {str(e)}",
        )


@router.post("/retrieve", status_code=status.HTTP_200_OK)
async def retrieve_data(request: DataRetrievalRequest) -> DataRetrievalResponse:
    """Retrieve structured data from LightRAG without LLM generation."""
    start_time = time.time()

    try:
        # Validate query parameter
        if not request.query or not request.query.strip():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Query text cannot be empty")

        # Get or create instance
        instance = await _get_or_create_instance_by_params(
            workspace_id=request.workspace_id,
            llm_model=request.llm_model,
            embedding_model=request.embedding_model,
            rerank_model=request.rerank_model,
        )

        # Acquire instance
        await instance.acquire()

        try:
            logger.info(
                "retrieve_data_start",
                instance_id=instance.instance_id,
                workspace_id=request.workspace_id,
                query=request.query[:100] + "..." if len(request.query) > 100 else request.query,
                mode=request.mode,
                page=request.page,
                page_size=request.page_size,
                timeout_seconds=request.timeout,
            )

            # Create QueryParam from request with all fields
            query_param = QueryParam(
                mode=request.mode,
                response_type=request.response_type,
                stream=request.stream or False,  # Default to False for data retrieval
                only_need_context=request.only_need_context
                if request.only_need_context is not None
                else True,  # Data retrieval mode
                only_need_prompt=request.only_need_prompt or False,
                top_k=request.top_k,
                chunk_top_k=request.chunk_top_k,
                # max_entity_tokens=request.max_entity_tokens,
                # max_relation_tokens=request.max_relation_tokens,
                # max_total_tokens=request.max_total_tokens,
                hl_keywords=request.hl_keywords,
                ll_keywords=request.ll_keywords,
                conversation_history=request.conversation_history or [],
                user_prompt=request.user_prompt,
                enable_rerank=request.enable_rerank,
                include_references=request.include_references or False,
            )

            # Execute with timeout
            timeout = request.timeout or 30
            try:
                result = await asyncio.wait_for(
                    instance.lightrag.aquery_data(request.query.strip(), param=query_param), timeout=timeout
                )
                logger.debug("retrieve_data_origin_result", result=result)
                timeout_hit = False
            except asyncio.TimeoutError:
                logger.warning(
                    "retrieve_data_timeout",
                    instance_id=instance.instance_id,
                    workspace_id=request.workspace_id,
                    timeout_seconds=timeout,
                )
                timeout_hit = True
                result = {
                    "status": "failure",
                    "message": f"Query timed out after {timeout} seconds",
                    "data": {},
                    "metadata": {
                        "failure_reason": "timeout",
                        "mode": request.mode,
                        "timeout_seconds": timeout,
                    },
                }

            processing_time = (time.time() - start_time) * 1000

            # Process result and apply pagination
            response_data = _process_retrieval_result(result, request)

            logger.info(
                "retrieve_data_success",
                instance_id=instance.instance_id,
                workspace_id=request.workspace_id,
                processing_time_ms=round(processing_time, 2),
                entities_count=len(response_data.entities),
                relationships_count=len(response_data.relationships),
                chunks_count=len(response_data.chunks),
                timeout_hit=timeout_hit,
            )

            return DataRetrievalResponse(
                success=response_data.success,
                message=response_data.message,
                query=request.query,
                mode=request.mode,
                entities=response_data.entities,
                relationships=response_data.relationships,
                chunks=response_data.chunks,
                references=response_data.references,
                metadata=response_data.metadata,
                pagination=response_data.pagination,
                processing_time_ms=round(processing_time, 2),
                timeout_hit=timeout_hit,
            )

        finally:
            # Always release instance
            await instance.release()

    except HTTPException:
        # Re-raise HTTP exceptions as-is
        raise
    except Exception as e:
        processing_time = (time.time() - start_time) * 1000
        logger.error(
            "retrieve_data_error",
            workspace_id=request.workspace_id,
            query=request.query[:100] + "..." if len(request.query) > 100 else request.query,
            error=str(e),
            processing_time_ms=round(processing_time, 2),
        )
        logger.error(traceback.format_exc())

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve data: {str(e)}",
        )


def _process_retrieval_result(result: dict[str, Any], request: DataRetrievalRequest) -> DataRetrievalResponse:
    """Process retrieval result and apply enhanced pagination with sorting and filtering."""

    if not isinstance(result, dict) or result.get("status") != "success":
        # Handle failure response
        message = result.get("message", "Query failed") if isinstance(result, dict) else "Invalid response format"
        return DataRetrievalResponse(
            success=False,
            message=message,
            query=request.query,
            mode=request.mode,
            metadata=result.get("metadata", {}) if isinstance(result, dict) else {},
        )

    data = result.get("data", {})
    metadata = result.get("metadata", {})

    # Extract raw data
    raw_entities = data.get("entities", [])
    raw_relationships = data.get("relationships", [])
    raw_chunks = data.get("chunks", [])
    raw_references = data.get("references", [])

    # Handle pagination parameters (they are Optional[int])
    page = request.page or 1
    page_size = request.page_size or 100

    # Apply filtering if specified
    if request.filter_by:
        raw_entities = _apply_filter(raw_entities, request.filter_by)
        raw_relationships = _apply_filter(raw_relationships, request.filter_by)
        raw_chunks = _apply_filter(raw_chunks, request.filter_by)

    # Apply sorting if specified
    if request.sort_by:
        sort_direction = request.sort_direction
        raw_entities = _apply_sorting(raw_entities, request.sort_by, sort_direction)
        raw_relationships = _apply_sorting(raw_relationships, request.sort_by, sort_direction)
        raw_chunks = _apply_sorting(raw_chunks, request.sort_by, sort_direction)

    # Apply pagination
    entities, entities_pagination = _paginate_list(raw_entities, page, page_size)
    relationships, relationships_pagination = _paginate_list(raw_relationships, page, page_size)
    chunks, chunks_pagination = _paginate_list(raw_chunks, page, page_size)

    # Create pagination info (based on largest dataset)
    total_items = max(len(raw_entities), len(raw_relationships), len(raw_chunks))
    pagination_info = None
    if total_items > 0:
        total_pages = (total_items + page_size - 1) // page_size
        pagination_info = PaginationInfo(
            page=page,
            page_size=page_size,
            total_items=total_items,
            total_pages=total_pages,
            has_next=page < total_pages,
            has_prev=page > 1,
        )

    # Update metadata with enhanced info
    enhanced_metadata = metadata.copy()
    enhanced_metadata.update({
        "query_params": {
            "mode": request.mode,
            "sort_by": request.sort_by,
            "sort_direction": request.sort_direction,
            "has_filter": bool(request.filter_by),
        },
        "original_counts": {
            "entities": len(raw_entities),
            "relationships": len(raw_relationships),
            "chunks": len(raw_chunks),
            "references": len(raw_references),
        },
        "returned_counts": {
            "entities": len(entities),
            "relationships": len(relationships),
            "chunks": len(chunks),
            "references": len(raw_references),
        },
    })

    # Include references if requested
    references_to_return = raw_references if (request.include_references or False) else []

    return DataRetrievalResponse(
        success=True,
        message=result.get("message", "Query executed successfully"),
        query=request.query,
        mode=request.mode,
        entities=entities,
        relationships=relationships,
        chunks=chunks,
        references=references_to_return,
        metadata=enhanced_metadata,
        pagination=pagination_info,
    )


def _paginate_list(
    items: List[Dict[str, Any]], page: int, page_size: int
) -> Tuple[List[Dict[str, Any]], Dict[str, int]]:
    """Paginate a list and return paginated items with pagination info."""
    if page_size <= 0 or page <= 0:
        return items, {}

    start_idx = (page - 1) * page_size
    end_idx = start_idx + page_size

    paginated_items = items[start_idx:end_idx]

    total_items = len(items)
    total_pages = (total_items + page_size - 1) // page_size

    pagination_info = {
        "current_page": page,
        "page_size": page_size,
        "total_items": total_items,
        "total_pages": total_pages,
        "has_next": page < total_pages,
        "has_prev": page > 1,
        "start_index": start_idx + 1,  # 1-based for user display
        "end_index": min(end_idx, total_items),
    }

    return paginated_items, pagination_info


def _apply_filter(items: List[Dict[str, Any]], filter_criteria: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Apply filtering to a list of items based on filter criteria."""
    if not filter_criteria or not items:
        return items

    filtered_items = []
    for item in items:
        match = True
        for key, value in filter_criteria.items():
            # Support nested key access with dot notation
            item_value = item
            for key_part in key.split("."):
                if isinstance(item_value, dict) and key_part in item_value:
                    item_value = item_value[key_part]
                else:
                    match = False
                    break

            if match:
                # Support different comparison operations
                if isinstance(value, dict):
                    # Range filtering
                    if "min" in value and item_value < value["min"]:
                        match = False
                    if "max" in value and item_value > value["max"]:
                        match = False
                    if "in" in value and item_value not in value["in"]:
                        match = False
                    if "contains" in value and isinstance(item_value, str) and value["contains"] not in item_value:
                        match = False
                else:
                    # Direct equality check
                    if item_value != value:
                        match = False

            if not match:
                break

        if match:
            filtered_items.append(item)

    return filtered_items


def _apply_sorting(items: List[Dict[str, Any]], sort_by: str, sort_direction: str) -> List[Dict[str, Any]]:
    """Apply sorting to a list of items based on sort field and direction."""
    if not sort_by or not items:
        return items

    def get_sort_value(item: Dict[str, Any]) -> Any:
        # Support nested key access with dot notation
        value = item
        for key_part in sort_by.split("."):
            if isinstance(value, dict) and key_part in value:
                value = value[key_part]
            else:
                return None
        return value

    try:
        reverse = sort_direction == "desc"
        return sorted(items, key=get_sort_value, reverse=reverse)
    except (TypeError, KeyError):
        # If sorting fails, return original items
        logger.warning("sorting_failed", sort_by=sort_by, sort_direction=sort_direction, items_count=len(items))
        return items
