#!/usr/bin/env python3
import logging
import os
import sys

# 以「backend/」为工作区根导入 bubblechart_backend
if __name__ == "__main__" and __package__ is None:
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from bubblechart_backend.app import create_app
from bubblechart_backend.config import load_config


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    cfg = load_config()
    app = create_app(cfg)
    app.run(host=cfg.host, port=cfg.port, debug=cfg.debug)


if __name__ == "__main__":
    main()
