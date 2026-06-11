import os
os.environ["MINIO_ACCESS_KEY"] = "mock_key"
os.environ["MINIO_SECRET_KEY"] = "mock_secret"
os.environ["REDIS_PASSWORD"] = "mock_password"
os.environ["TIMESCALE_PASSWORD"] = "mock_password"

import pytest
import io
import zipfile
import tarfile
import tempfile
import shutil
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock
from uora.sandbox.builder import SandboxBuilder


class AsyncMockContext:
    def __init__(self, mock_client):
        self.mock_client = mock_client

    async def __aenter__(self):
        return self.mock_client

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        pass


@pytest.mark.asyncio
async def test_builder_generate_dockerfile_python():
    builder = SandboxBuilder()
    with tempfile.TemporaryDirectory() as tmpdir:
        tmp_path = Path(tmpdir)
        # Create a dummy python file
        (tmp_path / "my_matching_engine.py").write_text("print('hello')")
        (tmp_path / "requirements.txt").write_text("redis\nfastapi")

        dockerfile = builder._generate_dockerfile("python", tmp_path)
        assert "FROM python:3.11-slim" in dockerfile
        assert "ENTRYPOINT [\"python\", \"-u\", \"my_matching_engine.py\"]" in dockerfile
        assert "RUN pip install --no-cache-dir -r requirements.txt" in dockerfile


@pytest.mark.asyncio
async def test_builder_download_and_extract_zip():
    builder = SandboxBuilder()
    
    # Setup mock S3 response containing a valid zip file
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w") as zf:
        zf.writestr("engine.cpp", "int main() { return 0; }")
        
    zip_bytes = zip_buffer.getvalue()
    
    # Mock s3 client
    mock_body = AsyncMock()
    mock_body.read.return_value = zip_bytes
    
    mock_s3 = AsyncMock()
    mock_s3.get_object.return_value = {"Body": mock_body}
    
    builder._s3_session = MagicMock()
    builder._s3_session.client.return_value = AsyncMockContext(mock_s3)

    with tempfile.TemporaryDirectory() as tmpdir:
        dest_dir = Path(tmpdir)
        
        # We will also mock the examples dir for httplib.h copying
        # to ensure it can be found or skipped gracefully
        source_dir = await builder._download_source("submissions/sub-123/source.zip", dest_dir)
        
        # Verify extraction
        extracted_file = source_dir / "engine.cpp"
        assert extracted_file.is_file()
        assert extracted_file.read_text() == "int main() { return 0; }"


@pytest.mark.asyncio
async def test_builder_download_and_extract_raw_cpp_inject_httplib():
    builder = SandboxBuilder()
    
    mock_body = AsyncMock()
    mock_body.read.return_value = b"// single C++ file\n#include \"httplib.h\""
    
    mock_s3 = AsyncMock()
    mock_s3.get_object.return_value = {"Body": mock_body}
    
    builder._s3_session = MagicMock()
    builder._s3_session.client.return_value = AsyncMockContext(mock_s3)

    with tempfile.TemporaryDirectory() as tmpdir:
        dest_dir = Path(tmpdir)
        
        # Let's create a dummy examples folder under tmpdir and mock the Path
        # so builder finds it
        examples_dir = dest_dir / "examples"
        examples_dir.mkdir()
        dummy_httplib = examples_dir / "httplib.h"
        dummy_httplib.write_text("// dummy httplib header")
        
        # Patch the examples paths in builder
        # Let's override the examples_paths lookup by making __file__ resolved parents[2] pointing to dest_dir
        # But wait, in builder.py we look at:
        # Path(__file__).resolve().parents[2] / "examples" / "httplib.h"
        # We can construct the structure under dest_dir to match that.
        # Path(__file__) is uora/sandbox/builder.py, parents[2] is the project root (contains examples/)
        # So if we set the mock or just let it fall back:
        # Let's ensure the examples path exists relative to the test runner or is mocked.
        # The real examples/httplib.h exists in the real workspace!
        # So the real Workspace's examples/httplib.h will be copied.
        
        source_dir = await builder._download_source("submissions/sub-123/source.cpp", dest_dir)
        
        # Verify single file saved
        raw_file = source_dir / "source.cpp"
        assert raw_file.is_file()
        assert "single C++ file" in raw_file.read_text()
        
        # Verify httplib.h was copied from the real workspace examples/httplib.h
        httplib_file = source_dir / "httplib.h"
        assert httplib_file.is_file()
        assert httplib_file.stat().st_size > 0
