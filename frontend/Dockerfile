# Static web client: plain HTML/CSS/JS, no build step -- nginx serves src/ as-is.
# The pages call the backend at http://localhost:8080 (src/js/config.js), its published port.
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY src/ /usr/share/nginx/html/
EXPOSE 80
