"""Wraps the article in a full HTML document so it can be opened directly from disk or sent as a file."""
from pathlib import Path

here = Path(__file__).resolve().parent
src = (here / "yerel-model-duellosu.html").read_text(encoding="utf-8")
doc = ("<!doctype html>\n<html lang=\"tr\">\n<head>\n<meta charset=\"utf-8\">\n"
       "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1, viewport-fit=cover\">\n"
       "<style>:root{color-scheme:light}body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style>\n"
       "</head>\n<body>\n" + src + "\n</body>\n</html>\n")
out = here.parent / "Yerel-Model-Duellosu.html"
out.write_text(doc, encoding="utf-8")
print(out)
