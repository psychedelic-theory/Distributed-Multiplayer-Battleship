# Frontend — served as static files via nginx
# Northflank: set subdirectory to `frontend/` when creating this service
FROM nginx:alpine
# Copy all static assets
COPY . /usr/share/nginx/html
# Custom nginx config: SPA-friendly, CORS headers for API calls
RUN printf 'server {\n\
  listen 80;\n\
  root /usr/share/nginx/html;\n\
  index index.html;\n\
\n\
  # Serve static files directly\n\
  location / {\n\
    try_files $uri $uri/ /index.html;\n\
    add_header Cache-Control "no-cache";\n\
  }\n\
\n\
  # Cache static assets aggressively\n\
  location ~* \\.(css|js|svg|ico|png|jpg|jpeg|woff2)$ {\n\
    expires 1y;\n\
    add_header Cache-Control "public, immutable";\n\
  }\n\
\n\
  gzip on;\n\
  gzip_types text/plain text/css application/javascript;\n\
}\n' > /etc/nginx/conf.d/default.conf

EXPOSE 80
