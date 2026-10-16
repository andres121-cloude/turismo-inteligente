# Usamos una imagen oficial de Node.js (versión ligera)
FROM node:20-alpine

# Creamos y nos movemos al directorio de trabajo dentro del contenedor
WORKDIR /app

# Copiamos primero los archivos de dependencias para aprovechar el caché de Docker
COPY package*.json ./

# Instalamos las dependencias en producción (o todas si estás desarrollando)
RUN npm install

# Copiamos el resto del código fuente del proyecto
COPY . .

# Exponemos el puerto en el que corre tu aplicación (ej. 3000)
EXPOSE 3000

# Comando para iniciar la aplicación
CMD ["npm", "start"]