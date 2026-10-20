# Imagem "web": compila o frontend (multi-stage) e serve com nginx, fazendo proxy de /api
# para o serviço "api". Usada por docker-compose.yml (build: context ., dockerfile web/Dockerfile).
# Recriado no AVADESK: o upstream referenciava este arquivo mas não o versionava.
FROM --platform=$BUILDPLATFORM node:22-alpine AS build
WORKDIR /app
# A mídia é montada no nginx em /img e /gif (serviço "media" do compose).
ARG VITE_IMG_BASE=/img/
ARG VITE_GIF_BASE=/gif/
# Opcional: URL pública do código-fonte desta versão (AGPL-3.0 §13).
ARG VITE_SOURCE_URL=
ENV VITE_IMG_BASE=$VITE_IMG_BASE VITE_GIF_BASE=$VITE_GIF_BASE VITE_SOURCE_URL=$VITE_SOURCE_URL
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM nginx:alpine
COPY web/nginx.conf /etc/nginx/conf.d/default.conf
# cabeçalhos de segurança (CSP etc.), incluídos pelo default.conf
COPY web/security-headers.inc /etc/nginx/conf.d/security-headers.inc
COPY --from=build /app/dist /usr/share/nginx/html
# img/ e gif/ são montados em runtime a partir de ./media