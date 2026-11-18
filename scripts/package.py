from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
root = Path(__file__).resolve().parent.parent
(root / 'dist').mkdir(exist_ok=True)
with ZipFile(root / 'dist/subspace-extension.zip', 'w', ZIP_DEFLATED) as package:
    for path in (root / 'extension').iterdir():
        if path.is_file():
            package.write(path, path.name)
# Keep the unpacked installation in sync with the exact packaged contents.
with ZipFile(root / 'dist/subspace-extension.zip') as package:
    package.extractall(root / 'dist/subspace-extension')
print(root / 'dist/subspace-extension.zip')
print(root / 'dist/subspace-extension')
