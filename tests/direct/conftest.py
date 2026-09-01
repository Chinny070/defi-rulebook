"""Test-harness shims. Nothing here affects the production contract.

Windows workaround for gltest 0.29.2
------------------------------------
`gltest.direct.loader._inject_message_to_fd0` writes the encoded message to a
temp file, `os.dup2`s it onto fd 0, then calls `os.unlink` on it in a `finally`
block. POSIX allows unlinking a file that is still open; Windows does not, so
the unlink raises `PermissionError: [WinError 32]` and every direct-mode deploy
fails before the contract is even loaded.

The fd-0 injection has already succeeded by the time unlink runs, so tolerating
that specific failure restores direct mode on Windows. The cost is one leaked
file in the system temp directory per deploy.

This is a harness bug, not a contract defect: the same contract loads and
validates cleanly under `genvm-lint check`.
"""

import os
import platform

if platform.system() == "Windows":
    _real_unlink = os.unlink

    def _tolerant_unlink(path, *args, **kwargs):
        try:
            return _real_unlink(path, *args, **kwargs)
        except PermissionError:
            # File is still open as fd 0; Windows refuses to unlink it.
            return None

    os.unlink = _tolerant_unlink
