# SGRC Frontend — Vite build servido por nginx
# Multi-stage: build con node, serve con nginx-alpine.

# ---------- Stage 1: build ----------
FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# El build se sirve estático — VITE_API_BASE no se necesita porque nginx hace
# proxy de /api/* al backend (ver nginx.conf).
ENV NODE_ENV=production
RUN npm run build

# ---------- Stage 2: nginx ----------
FROM nginx:1.27-alpine AS runtime

# Borrar config default y poner la nuestra (SPA + proxy)
RUN rm /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf

COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
