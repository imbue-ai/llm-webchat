import pytest
from starlette.testclient import TestClient

from llm_webchat.server import create_application


@pytest.fixture()
def application():
    return create_application()


@pytest.fixture()
def client(application):
    return TestClient(application)
