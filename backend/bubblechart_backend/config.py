import os
from dataclasses import dataclass
from pathlib import Path

from bubblechart_backend import __version__ as package_version

_DEFAULT_DATA_SUBDIR = "data"
_DEFAULT_DB_NAME = "saledata.db"


def _default_project_root() -> Path:
    # backend/bubblechart_backend/config.py -> 项目根 BubbleChart_GPT
    return Path(__file__).resolve().parent.parent.parent


@dataclass(frozen=True)
class Config:
    """运行时配置，可通过环境变量覆盖。"""

    project_root: Path
    data_dir: Path
    db_path: Path
    host: str
    port: int
    debug: bool
    version: str = package_version


def load_config() -> Config:
    project_root = Path(
        os.environ.get("BUBBLECHART_PROJECT_ROOT", str(_default_project_root()))
    ).resolve()
    data_dir = Path(
        os.environ.get("BUBBLECHART_DATA_DIR", str(project_root / _DEFAULT_DATA_SUBDIR))
    ).resolve()
    db_name = os.environ.get("BUBBLECHART_DB_NAME", _DEFAULT_DB_NAME)
    db_path = Path(os.environ.get("BUBBLECHART_DB_PATH", str(data_dir / db_name))).resolve()

    host = os.environ.get("BUBBLECHART_HOST", "127.0.0.1")
    port = int(os.environ.get("BUBBLECHART_PORT", "5050"))
    debug = os.environ.get("BUBBLECHART_DEBUG", "").lower() in (
        "1",
        "true",
        "yes",
    )

    return Config(
        project_root=project_root,
        data_dir=data_dir,
        db_path=db_path,
        host=host,
        port=port,
        debug=debug,
    )
