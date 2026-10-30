FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY server.py index.html start.bat README.md .gitignore ./
COPY css ./css
COPY js ./js
COPY assets ./assets
ENV HOST=0.0.0.0
ENV PORT=8080
EXPOSE 8080
CMD ["python", "server.py"]
