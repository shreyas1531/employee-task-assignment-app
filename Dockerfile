FROM ruby:3.2-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app/backend

COPY backend/Gemfile backend/Gemfile.lock ./
RUN bundle install

COPY . /app
RUN chmod +x /app/backend/scripts/start_web.sh

ENV RACK_ENV=production \
    APP_HOST=0.0.0.0 \
    APP_PORT=8080 \
    PORT=8080 \
    FRONTEND_ROOT=/app

EXPOSE 8080
CMD ["bash", "-lc", "/app/backend/scripts/start_web.sh"]
