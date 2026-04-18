FROM nginx:alpine

# Copy static site
COPY . /usr/share/nginx/html

# Replace default nginx config with one that:
#   - serves index.html for unknown paths (SPA fallback, though we don't use client-side routes)
#   - sets sensible cache headers
#   - serves on port 80
RUN printf 'server {\n\
  listen 80 default_server;\n\
  server_name _;\n\
  root /usr/share/nginx/html;\n\
  index index.html;\n\
\n\
  # Never cache index.html so deploys roll out instantly\n\
  location = /index.html {\n\
    add_header Cache-Control "no-store, no-cache, must-revalidate";\n\
  }\n\
\n\
  # Cache JS/CSS assets\n\
  location ~* \\.(js|css|png|jpg|jpeg|gif|svg|woff2?)$ {\n\
    expires 1h;\n\
    add_header Cache-Control "public, max-age=3600";\n\
  }\n\
\n\
  # Fallback to index.html for anything else\n\
  location / {\n\
    try_files $uri $uri/ /index.html;\n\
  }\n\
}\n' > /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
