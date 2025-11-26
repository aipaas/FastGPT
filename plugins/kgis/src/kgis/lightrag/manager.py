"""LightRAG instance manager for multi-workspace, multi-configuration support."""

import asyncio
import json
import os
import shutil
import threading
import time
from datetime import datetime, timezone
from functools import partial
from pathlib import Path
from typing import Any, Dict, List, Optional

import structlog
from lightrag import LightRAG
from lightrag.kg.shared_storage import initialize_pipeline_status
from lightrag.llm.openai import openai_complete_if_cache, openai_embed
from lightrag.rerank import ali_rerank
from lightrag.utils import EmbeddingFunc

from kgis.lightrag.get_embedding_dimension import get_embedding_dimension
from kgis.lightrag.lightrag_types import (
    CreateInstanceRequest,
    InstanceConfig,
    InstanceInfo,
    InstanceStatus,
)

logger = structlog.get_logger(__name__)


class LightRAGInstance:
    """Wrapper class for LightRAG instance with reference counting."""

    def __init__(self, instance_id: str, lightrag: LightRAG, config: InstanceConfig):
        self.instance_id = instance_id
        self.lightrag = lightrag
        self.config = config
        self.status = InstanceStatus.IDLE
        self.ref_count = 0
        self.created_at = datetime.now(timezone.utc)
        self.last_accessed = self.created_at
        self.usage_count = 0
        self.error_message: Optional[str] = None
        self._lock = asyncio.Lock()
        self._storage_path: Optional[str] = None

    async def acquire(self) -> None:
        """Acquire the instance for use."""
        async with self._lock:
            self.ref_count += 1
            self.status = InstanceStatus.BUSY
            self.last_accessed = datetime.now(timezone.utc)
            self.usage_count += 1
            logger.info(
                "instance_acquired",
                instance_id=self.instance_id,
                ref_count=self.ref_count,
            )

    async def release(self) -> None:
        """Release the instance after use."""
        async with self._lock:
            if self.ref_count > 0:
                self.ref_count -= 1
            if self.ref_count == 0:
                self.status = InstanceStatus.IDLE
            logger.info(
                "instance_released",
                instance_id=self.instance_id,
                ref_count=self.ref_count,
                status=self.status,
            )

    async def set_error(self, error_message: str) -> None:
        """Set instance to error state."""
        async with self._lock:
            self.status = InstanceStatus.ERROR
            self.error_message = error_message
            logger.error(
                "instance_error",
                instance_id=self.instance_id,
                error_message=error_message,
            )

    def get_info(self) -> InstanceInfo:
        """Get instance information."""
        return InstanceInfo(
            instance_id=self.instance_id,
            workspace_id=self.config.workspace_id,
            config=self.config,
            status=self.status,
            ref_count=self.ref_count,
            created_at=self.created_at,
            last_accessed=self.last_accessed,
            usage_count=self.usage_count,
            error_message=self.error_message,
            storage_path=self._storage_path,
        )


class LightRAGManager:
    """Manager for LightRAG instances with workspace isolation and configuration management."""

    def __init__(self, max_instances_per_workspace: int = 5, default_base_dir: str = "/tmp/kgis"):
        self.max_instances_per_workspace = max_instances_per_workspace
        self.default_base_dir = Path(default_base_dir)
        self._instances: Dict[str, LightRAGInstance] = {}
        self._manager_lock = asyncio.Lock()
        self._workspace_locks: Dict[str, asyncio.Lock] = {}
        self._status_file_lock = threading.Lock()

    def _generate_instance_key(self, config: InstanceConfig) -> str:
        """Generate unique instance key based on configuration."""
        key_parts = [
            config.workspace_id,
            config.llm_model,
            config.embedding_model,
        ]
        if config.rerank_model:
            key_parts.append(config.rerank_model)
        return ":".join(key_parts)

    def _get_workspace_dir(self, workspace_id: str) -> Path:
        """Get workspace directory path."""
        return self.default_base_dir / workspace_id

    def _get_status_file_path(self, workspace_id: str) -> Path:
        """Get status file path for workspace."""
        return self._get_workspace_dir(workspace_id) / "instance_status.json"

    def _get_workspace_lock(self, workspace_id: str) -> asyncio.Lock:
        """Get or create lock for workspace."""
        if workspace_id not in self._workspace_locks:
            self._workspace_locks[workspace_id] = asyncio.Lock()
        return self._workspace_locks[workspace_id]

    def _save_instance_status(self, instance: LightRAGInstance) -> None:
        """Save instance status to file."""
        try:
            status_file = self._get_status_file_path(instance.config.workspace_id)
            status_file.parent.mkdir(parents=True, exist_ok=True)

            with self._status_file_lock:
                # Read existing status
                if status_file.exists():
                    with open(status_file, "r", encoding="utf-8") as f:
                        status_data = json.load(f)
                else:
                    status_data = {"instances": {}}

                # Update instance status
                info = instance.get_info()
                status_data["instances"][instance.instance_id] = {
                    "instance_id": info.instance_id,
                    "workspace_id": info.workspace_id,
                    "config": info.config.dict(),
                    "status": info.status,
                    "ref_count": info.ref_count,
                    "created_at": info.created_at.isoformat(),
                    "last_accessed": info.last_accessed.isoformat(),
                    "usage_count": info.usage_count,
                    "error_message": info.error_message,
                    "storage_path": info.storage_path,
                }

                # Save to file
                with open(status_file, "w", encoding="utf-8") as f:
                    json.dump(status_data, f, indent=2, ensure_ascii=False)

        except Exception as e:
            logger.error(
                "save_status_failed",
                instance_id=instance.instance_id,
                error=str(e),
            )

    def _load_workspace_instances(self, workspace_id: str) -> Dict[str, Any]:
        """Load workspace instances from status file."""
        try:
            status_file = self._get_status_file_path(workspace_id)
            if not status_file.exists():
                return {}

            with self._status_file_lock:
                with open(status_file, "r", encoding="utf-8") as f:
                    status_data = json.load(f)
                    instances = status_data.get("instances", {})
                    return instances if isinstance(instances, dict) else {}

        except Exception as e:
            logger.error(
                "load_status_failed",
                workspace_id=workspace_id,
                error=str(e),
            )
            return {}

    def _delete_status_file_entry(self, workspace_id: str, instance_id: str) -> None:
        """Delete instance entry from status file."""
        try:
            status_file = self._get_status_file_path(workspace_id)
            if not status_file.exists():
                return

            with self._status_file_lock:
                with open(status_file, "r", encoding="utf-8") as f:
                    status_data = json.load(f)

                if "instances" in status_data and instance_id in status_data["instances"]:
                    del status_data["instances"][instance_id]

                    with open(status_file, "w", encoding="utf-8") as f:
                        json.dump(status_data, f, indent=2, ensure_ascii=False)

        except Exception as e:
            logger.error(
                "delete_status_entry_failed",
                workspace_id=workspace_id,
                instance_id=instance_id,
                error=str(e),
            )

    async def create_instance(self, request: CreateInstanceRequest) -> str:
        """Create a new LightRAG instance."""
        config = InstanceConfig(**request.dict())
        instance_key = self._generate_instance_key(config)

        async with self._manager_lock:
            # Check if instance already exists
            if instance_key in self._instances:
                logger.info(
                    "instance_already_exists",
                    instance_key=instance_key,
                )
                return instance_key

            # Check workspace instance limit
            workspace_lock = self._get_workspace_lock(config.workspace_id)
            async with workspace_lock:
                workspace_instances = [
                    inst for inst in self._instances.values() if inst.config.workspace_id == config.workspace_id
                ]

                if len(workspace_instances) >= self.max_instances_per_workspace:
                    logger.error(
                        "workspace_instance_limit_exceeded",
                        workspace_id=config.workspace_id,
                        count=len(workspace_instances),
                        limit=self.max_instances_per_workspace,
                    )
                    raise ValueError(
                        f"Workspace {config.workspace_id} has reached the maximum "
                        f"instance limit of {self.max_instances_per_workspace}"
                    )

            # Create workspace directory
            workspace_dir = self._get_workspace_dir(config.workspace_id)
            working_dir = config.working_dir or str(workspace_dir)
            Path(working_dir).mkdir(parents=True, exist_ok=True)

            try:
                logger.debug(
                    "create_instance_start",
                    workspace_id=config.workspace_id,
                    llm_model=config.llm_model,
                    embedding_model=config.embedding_model,
                )

                start_time = time.time()
                lightrag_instance = await self._create_lightrag_instance(config, working_dir)
                end_time = time.time()

                duration_ms = (end_time - start_time) * 1000
                logger.info(
                    "create_instance_profile",
                    workspace_id=config.workspace_id,
                    instance_key=instance_key,
                    duration_ms=round(duration_ms, 2),
                    duration_seconds=round(end_time - start_time, 4),
                )

                # Create wrapper instance
                instance = LightRAGInstance(instance_key, lightrag_instance, config)
                instance._storage_path = working_dir

                # Store instance
                self._instances[instance_key] = instance

                # Save status
                self._save_instance_status(instance)

                logger.info(
                    "instance_created",
                    instance_key=instance_key,
                    workspace_id=config.workspace_id,
                    working_dir=working_dir,
                )

                return instance_key

            except Exception as e:
                logger.error(
                    "instance_creation_failed",
                    instance_key=instance_key,
                    error=str(e),
                )
                raise

    async def _create_lightrag_instance(self, config: InstanceConfig, working_dir: str) -> LightRAG:
        """Create actual LightRAG instance with given configuration."""

        base_url = os.getenv("AIPROXY_API_ENDPOINT", "http://aiproxy:3000")
        api_key = os.getenv("AIPROXY_API_TOKEN", "aiproxy")

        llm_model = config.llm_model
        embedding_model = config.embedding_model
        rerank_model = config.rerank_model

        async def llm_model_func(
            prompt: str,
            system_prompt: Optional[str] = None,
            history_messages: Optional[List[Dict[str, Any]]] = None,
            keyword_extraction: bool = False,
            **kwargs: Any,
        ) -> str:
            if history_messages is None:
                history_messages = []
            result = await openai_complete_if_cache(
                llm_model,
                prompt,
                system_prompt=system_prompt,
                history_messages=history_messages,
                api_key=api_key,
                base_url=base_url + "/v1",
                **kwargs,
            )
            return str(result)

        embedding_func = EmbeddingFunc(
            embedding_dim=get_embedding_dimension(  # TODO: 实现动态获取嵌入模型的维度，结合缓存
                model=embedding_model,
                api_url=base_url + "/v1/embeddings",
                token=api_key,
            ),
            func=lambda texts: openai_embed(
                texts,
                model=embedding_model,
                base_url=base_url + "/v1",
                api_key=api_key,
            ),
        )

        rerank_model_func = (
            partial(
                ali_rerank,
                api_key=api_key,
                model=rerank_model,
                base_url=base_url,
            )
            if rerank_model
            else None
        )

        kv_storage = (
            config.storage_configs.kv_storage or "MongoKVStorage" if config.storage_configs else "MongoKVStorage"
        )
        graph_storage = (
            config.storage_configs.graph_storage or "Neo4JStorage" if config.storage_configs else "Neo4JStorage"
        )
        # vector_storage = (
        #     config.storage_configs.vector_storage or "PGVectorStorage" if
        #     config.storage_configs else "PGVectorStorage"
        # )
        docs_status_storage = (
            config.storage_configs.doc_status_storage or "MongoDocStatusStorage"
            if config.storage_configs
            else "MongoDocStatusStorage"
        )

        if config.addon_params is not None:  # TODO: 支持其它多语言配置
            if "language" not in config.addon_params:
                config.addon_params["language"] = "Chinese"
        if config.addon_params is None:
            config.addon_params = {"language": "Chinese"}

        rag = LightRAG(
            working_dir=working_dir,
            workspace=config.workspace_id,
            llm_model_func=llm_model_func,
            embedding_func=embedding_func,
            rerank_model_func=rerank_model_func,
            kv_storage=kv_storage,
            graph_storage=graph_storage,
            # vector_storage=vector_storage, # TODO: pgvector 同一张表不支持多维度设置，与FasgGPT对接冲突
            doc_status_storage=docs_status_storage,
            addon_params=config.addon_params or {},
        )
        await rag.initialize_storages()
        await initialize_pipeline_status()
        return rag

    async def get_instance(self, instance_key: str) -> Optional[LightRAGInstance]:
        """Get instance by key and update access time."""
        async with self._manager_lock:
            instance = self._instances.get(instance_key)
            if instance:
                instance.last_accessed = datetime.now(timezone.utc)
                self._save_instance_status(instance)
            return instance

    async def find_instance(
        self,
        workspace_id: str,
        llm_model: str,
        embedding_model: str,
        rerank_model: Optional[str] = None,
    ) -> Optional[LightRAGInstance]:
        """Find instance by configuration."""
        config = InstanceConfig(
            workspace_id=workspace_id,
            llm_model=llm_model,
            embedding_model=embedding_model,
            rerank_model=rerank_model,
        )
        instance_key = self._generate_instance_key(config)
        return await self.get_instance(instance_key)

    async def delete_instance(self, instance_key: str) -> bool:
        """Delete an instance."""
        async with self._manager_lock:
            instance = self._instances.get(instance_key)
            if not instance:
                return False

            # Check if instance is in use
            if instance.ref_count > 0:
                logger.warning(
                    "instance_in_use",
                    instance_key=instance_key,
                    ref_count=instance.ref_count,
                )
                raise ValueError(f"Instance {instance_key} is currently in use")

            # Remove from memory
            del self._instances[instance_key]

            # Clean up storage
            if instance._storage_path and os.path.exists(instance._storage_path):
                try:
                    shutil.rmtree(instance._storage_path)
                    logger.info(
                        "storage_cleaned",
                        instance_key=instance_key,
                        storage_path=instance._storage_path,
                    )
                except Exception as e:
                    logger.error(
                        "storage_cleanup_failed",
                        instance_key=instance_key,
                        storage_path=instance._storage_path,
                        error=str(e),
                    )

            # Remove status file entry
            self._delete_status_file_entry(instance.config.workspace_id, instance_key)

            logger.info(
                "instance_deleted",
                instance_key=instance_key,
                workspace_id=instance.config.workspace_id,
            )

            return True

    async def delete_workspace_instances(self, workspace_id: str) -> int:
        """Delete all instances in a workspace."""
        workspace_lock = self._get_workspace_lock(workspace_id)
        async with workspace_lock:
            # Find all instances in workspace
            instances_to_delete = [
                instance_key
                for instance_key, instance in self._instances.items()
                if instance.config.workspace_id == workspace_id
            ]

            # Check if any instances are in use
            in_use_instances = [
                instance_key for instance_key in instances_to_delete if self._instances[instance_key].ref_count > 0
            ]

            if in_use_instances:
                logger.warning(
                    "workspace_instances_in_use",
                    workspace_id=workspace_id,
                    in_use_count=len(in_use_instances),
                    in_use_instances=in_use_instances,
                )
                raise ValueError(
                    f"Cannot delete workspace {workspace_id}: {len(in_use_instances)} instances are currently in use"
                )

            # Delete all instances
            deleted_count = 0
            for instance_key in instances_to_delete:
                try:
                    if await self.delete_instance(instance_key):
                        deleted_count += 1
                except Exception as e:
                    logger.error(
                        "delete_workspace_instance_failed",
                        workspace_id=workspace_id,
                        instance_key=instance_key,
                        error=str(e),
                    )

            logger.info(
                "workspace_instances_deleted",
                workspace_id=workspace_id,
                deleted_count=deleted_count,
                total_count=len(instances_to_delete),
            )

            return deleted_count

    def list_workspace_instances(self, workspace_id: str) -> list[InstanceInfo]:
        """List all instances in a workspace."""
        return [
            instance.get_info() for instance in self._instances.values() if instance.config.workspace_id == workspace_id
        ]

    def get_instance_info(self, instance_key: str) -> Optional[InstanceInfo]:
        """Get instance information."""
        instance = self._instances.get(instance_key)
        return instance.get_info() if instance else None

    def get_all_instances(self) -> list[InstanceInfo]:
        """Get all instances."""
        return [instance.get_info() for instance in self._instances.values()]

    def get_workspace_instance_count(self, workspace_id: str) -> int:
        """Get number of instances in a workspace."""
        return sum(1 for instance in self._instances.values() if instance.config.workspace_id == workspace_id)

    async def restore_instances(self) -> None:
        """Restore instances from status files on startup."""
        logger.info("restoring_instances_start")

        # Scan workspace directories for status files
        for workspace_dir in self.default_base_dir.iterdir():
            if not workspace_dir.is_dir():
                continue

            workspace_id = workspace_dir.name
            instances_data = self._load_workspace_instances(workspace_id)

            for instance_id, instance_data in instances_data.items():
                try:
                    # Recreate config
                    config_dict = instance_data["config"]
                    config = InstanceConfig(**config_dict)

                    # Check if workspace directory exists
                    working_dir = instance_data.get("storage_path") or str(workspace_dir)
                    if not os.path.exists(working_dir):
                        logger.warning(
                            "workspace_dir_not_found",
                            workspace_id=workspace_id,
                            instance_id=instance_id,
                            working_dir=working_dir,
                        )
                        continue

                    # Recreate LightRAG instance
                    lightrag_instance = await self._create_lightrag_instance(config, working_dir)

                    # Recreate wrapper instance
                    instance = LightRAGInstance(instance_id, lightrag_instance, config)
                    instance.status = InstanceStatus(instance_data["status"])
                    instance.ref_count = instance_data["ref_count"]
                    instance.created_at = datetime.fromisoformat(instance_data["created_at"])
                    instance.last_accessed = datetime.fromisoformat(instance_data["last_accessed"])
                    instance.usage_count = instance_data["usage_count"]
                    instance.error_message = instance_data.get("error_message")
                    instance._storage_path = working_dir

                    # Reset ref count to 0 on startup (instances shouldn't be in use)
                    instance.ref_count = 0
                    if instance.status == InstanceStatus.BUSY:
                        instance.status = InstanceStatus.IDLE

                    # Store instance
                    self._instances[instance_id] = instance

                    logger.info(
                        "instance_restored",
                        instance_id=instance_id,
                        workspace_id=workspace_id,
                    )

                except Exception as e:
                    logger.error(
                        "restore_instance_failed",
                        workspace_id=workspace_id,
                        instance_id=instance_id,
                        error=str(e),
                    )

        logger.info(
            "restoring_instances_complete",
            total_instances=len(self._instances),
        )


# Global instance manager
_manager: Optional[LightRAGManager] = None


async def get_manager() -> LightRAGManager:
    """Get or create the global LightRAG manager."""
    global _manager
    if _manager is None:
        _manager = LightRAGManager()
        # Restore instances on startup
        await _manager.restore_instances()
    return _manager
