from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import json
from analyzer import analyze_har

<<<<<<< HEAD
app = FastAPI(root_path="/har-analyzer")
=======
from analyzer import analyze_har

app = FastAPI()
>>>>>>> 014926307d90f753b1557877e9b544c76f7aae31

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static frontend
app.mount("/static", StaticFiles(directory="static"), name="static")


@app.get("/")
def home():
    return FileResponse("static/index.html")


@app.post("/upload")
async def upload(file: UploadFile = File(...)):
    content = await file.read()
    har = json.loads(content)

    result = analyze_har(har)

<<<<<<< HEAD
    return result
=======
    return result
>>>>>>> 014926307d90f753b1557877e9b544c76f7aae31
