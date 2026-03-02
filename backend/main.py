from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import json

from analyzer import analyze_har

app = FastAPI()

# ✅ CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ✅ Serve static files
app.mount("/static", StaticFiles(directory="static"), name="static")


# ✅ Load frontend
@app.get("/")
def home():
    return FileResponse("static/index.html")


# ✅ Upload API
@app.post("/upload")
async def upload(file: UploadFile = File(...)):

    content = await file.read()
    har = json.loads(content)

    result = analyze_har(har)

    return result
