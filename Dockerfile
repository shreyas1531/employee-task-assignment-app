FROM ruby:3.2-slim
ARG BUNDLER_VERSION=2.4.22

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    ca-certificates \
 && rm -rf /var/lib/apt/lists/*
RUN gem install bundler -v "${BUNDLER_VERSION}"

WORKDIR /app/backend

COPY backend/Gemfile backend/Gemfile.lock ./
RUN bundle _${BUNDLER_VERSION}_ install --jobs=4 --retry=3

COPY . /app
RUN chmod +x /app/backend/scripts/start_web.sh

ENV RACK_ENV=production \
    APP_HOST=0.0.0.0 \
    APP_PORT=8080 \
    PORT=8080 \
    FRONTEND_ROOT=/app

EXPOSE 8080
CMD ["bash", "-lc", "/app/backend/scripts/start_web.sh"]
