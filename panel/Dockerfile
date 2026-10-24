# ---------- مرحله ساخت ----------
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY . .
RUN npm run build

# ---------- مرحله سرو ----------
# فقط فایل‌های استاتیک SPA سرو می‌شوند؛ پروکسی /api /device-api /media /ws
# بر عهده nginx گیت‌وی (کانتینر nginx در docker-compose) است.
FROM nginx:1.27-alpine
RUN rm /etc/nginx/conf.d/default.conf
COPY panel-nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
