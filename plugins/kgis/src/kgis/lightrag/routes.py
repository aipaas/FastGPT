"""FastAPI routes for LightRAG instance management."""

from datetime import datetime
from typing import Any, Dict, List

import structlog
from fastapi import APIRouter, HTTPException, status

from kgis.lightrag.manager import get_manager
from kgis.lightrag.types import (
    CreateInstanceRequest,
    CreateInstanceResponse,
    DeleteInstanceResponse,
    DeleteWorkspaceInstancesResponse,
    FindInstanceRequest,
    FindInstanceResponse,
    ListInstancesResponse,
)

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/api/lightrag/instances", tags=["lightrag"])


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_instance(request: CreateInstanceRequest) -> CreateInstanceResponse:
    """Create a new LightRAG instance."""
    try:
        manager = await get_manager()
        instance_key = await manager.create_instance(request)

        instance_info = manager.get_instance_info(instance_key)
        if not instance_info:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to retrieve created instance information",
            )

        logger.info(
            "create_instance_success",
            instance_key=instance_key,
            workspace_id=request.workspace_id,
        )

        return CreateInstanceResponse(
            instance_id=instance_key,
            workspace_id=request.workspace_id,
            status="created",
            created_at=datetime.now(),
        )

    except ValueError as e:
        logger.warning(
            "create_instance_validation_error",
            workspace_id=request.workspace_id,
            error=str(e),
        )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(e),
        )

    except Exception as e:
        logger.error(
            "create_instance_error",
            workspace_id=request.workspace_id,
            error=str(e),
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create instance: {str(e)}",
        )


@router.post("/find")
async def find_instance(request: FindInstanceRequest) -> FindInstanceResponse:
    """Find an instance by configuration."""
    try:
        manager = await get_manager()
        instance = await manager.find_instance(
            workspace_id=request.workspace_id,
            llm_model=request.llm_model,
            embedding_model=request.embedding_model,
            rerank_model=request.rerank_model,
        )

        if instance:
            logger.info(
                "find_instance_success",
                instance_id=instance.instance_id,
                workspace_id=request.workspace_id,
            )
            return FindInstanceResponse(
                found=True,
                instance_id=instance.instance_id,
                instance=instance.get_info(),
            )
        else:
            logger.info(
                "find_instance_not_found",
                workspace_id=request.workspace_id,
                llm_model=request.llm_model,
                embedding_model=request.embedding_model,
            )
            return FindInstanceResponse(found=False)

    except Exception as e:
        logger.error(
            "find_instance_error",
            workspace_id=request.workspace_id,
            error=str(e),
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to find instance: {str(e)}",
        )


@router.get("/{workspace_id}")
async def list_workspace_instances(workspace_id: str) -> ListInstancesResponse:
    """List all instances in a workspace."""
    try:
        manager = await get_manager()
        instances = manager.list_workspace_instances(workspace_id)

        logger.info(
            "list_workspace_instances_success",
            workspace_id=workspace_id,
            instance_count=len(instances),
        )

        return ListInstancesResponse(
            instances=instances,
            total_count=len(instances),
        )

    except Exception as e:
        logger.error(
            "list_workspace_instances_error",
            workspace_id=workspace_id,
            error=str(e),
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list instances: {str(e)}",
        )


@router.get("/instance/{instance_id}")
async def get_instance_info(instance_id: str) -> Dict[str, Any]:
    """Get detailed information about a specific instance."""
    try:
        manager = await get_manager()
        instance_info = manager.get_instance_info(instance_id)

        if not instance_info:
            logger.warning(
                "get_instance_info_not_found",
                instance_id=instance_id,
            )
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Instance {instance_id} not found",
            )

        logger.info(
            "get_instance_info_success",
            instance_id=instance_id,
        )

        return instance_info.dict()

    except HTTPException:
        raise

    except Exception as e:
        logger.error(
            "get_instance_info_error",
            instance_id=instance_id,
            error=str(e),
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get instance info: {str(e)}",
        )


@router.delete("/{instance_id}")
async def delete_instance(instance_id: str) -> DeleteInstanceResponse:
    """Delete a specific instance."""
    try:
        manager = await get_manager()
        success = await manager.delete_instance(instance_id)

        if not success:
            logger.warning(
                "delete_instance_not_found",
                instance_id=instance_id,
            )
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Instance {instance_id} not found",
            )

        logger.info(
            "delete_instance_success",
            instance_id=instance_id,
        )

        return DeleteInstanceResponse(
            instance_id=instance_id,
            status="deleted",
            message="Instance deleted successfully",
        )

    except HTTPException:
        raise

    except ValueError as e:
        logger.warning(
            "delete_instance_validation_error",
            instance_id=instance_id,
            error=str(e),
        )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(e),
        )

    except Exception as e:
        logger.error(
            "delete_instance_error",
            instance_id=instance_id,
            error=str(e),
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete instance: {str(e)}",
        )


@router.delete("/workspace/{workspace_id}")
async def delete_workspace_instances(workspace_id: str) -> DeleteWorkspaceInstancesResponse:
    """Delete all instances in a workspace."""
    try:
        manager = await get_manager()
        deleted_count = await manager.delete_workspace_instances(workspace_id)

        logger.info(
            "delete_workspace_instances_success",
            workspace_id=workspace_id,
            deleted_count=deleted_count,
        )

        return DeleteWorkspaceInstancesResponse(
            workspace_id=workspace_id,
            deleted_instances=deleted_count,
            status="all_deleted",
            message=f"All {deleted_count} instances in workspace {workspace_id} have been deleted",
        )

    except ValueError as e:
        logger.warning(
            "delete_workspace_instances_validation_error",
            workspace_id=workspace_id,
            error=str(e),
        )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(e),
        )

    except Exception as e:
        logger.error(
            "delete_workspace_instances_error",
            workspace_id=workspace_id,
            error=str(e),
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete workspace instances: {str(e)}",
        )


@router.get("")
async def list_all_instances() -> Dict[str, Any]:
    """List all instances across all workspaces."""
    try:
        manager = await get_manager()
        instances = manager.get_all_instances()

        # Group by workspace for better organization
        workspace_groups: Dict[str, List[Dict[str, Any]]] = {}
        for instance in instances:
            workspace_id = instance.workspace_id
            if workspace_id not in workspace_groups:
                workspace_groups[workspace_id] = []
            workspace_groups[workspace_id].append(instance.dict())

        logger.info(
            "list_all_instances_success",
            total_instances=len(instances),
            workspace_count=len(workspace_groups),
        )

        return {
            "instances": [instance.dict() for instance in instances],
            "total_count": len(instances),
            "workspace_groups": workspace_groups,
            "workspace_count": len(workspace_groups),
        }

    except Exception as e:
        logger.error(
            "list_all_instances_error",
            error=str(e),
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list all instances: {str(e)}",
        )


@router.get("/stats/{workspace_id}")
async def get_workspace_stats(workspace_id: str) -> Dict[str, Any]:
    """Get statistics for a specific workspace."""
    try:
        manager = await get_manager()
        instances = manager.list_workspace_instances(workspace_id)
        instance_count = manager.get_workspace_instance_count(workspace_id)

        # Calculate statistics
        stats = {
            "workspace_id": workspace_id,
            "instance_count": instance_count,
            "total_instances": len(instances),
            "active_instances": len([i for i in instances if i.status == "busy"]),
            "idle_instances": len([i for i in instances if i.status == "idle"]),
            "error_instances": len([i for i in instances if i.status == "error"]),
            "total_usage_count": sum(i.usage_count for i in instances),
            "total_ref_count": sum(i.ref_count for i in instances),
        }

        logger.info(
            "get_workspace_stats_success",
            workspace_id=workspace_id,
            stats=stats,
        )

        return stats

    except Exception as e:
        logger.error(
            "get_workspace_stats_error",
            workspace_id=workspace_id,
            error=str(e),
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get workspace stats: {str(e)}",
        )
