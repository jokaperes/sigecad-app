FROM python:3.12-slim

WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

COPY server/requirements.txt server/requirements.txt
RUN pip install --no-cache-dir -r server/requirements.txt

COPY sigecad.py personal.py ./
COPY server ./server

# Modo default = pessoal em loop de 1h. Sobrescreva o command no compose p/ central.
CMD ["python", "personal.py", "--loop", "3600"]
