{
  "name": "agrobloque",
  "version": "1.0.0",
  "private": true,
  "dependencies": {
    "@supabase/supabase-js": "^2.39.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-router-dom": "^6.21.0",
    "react-scripts": "5.0.1"
  },
  "scripts": {
    "start": "react-scripts start",
    "build": "react-scripts build",
    "test": "react-scripts test"
  },
  "browserslist": {
    "production": [">0.2%", "not dead", "not op_mini all"],
    "development": ["last 1 chrome version", "last 1 firefox version", "last 1 safari version"]
  }
}

# AgroBloque

Sistema de gestión agrícola — Horticultura El Sembrador

## Setup

1. Clonar el repositorio
2. Crear archivo `.env` en la raíz con:
```
REACT_APP_SUPABASE_URL=https://utdlehbifdfiliozxbif.supabase.co
REACT_APP_SUPABASE_ANON_KEY=tu_anon_key_aqui
```
3. `npm install`
4. `npm start`

{
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ],
  "buildCommand": "npm run build",
  "outputDirectory": "build",
  "framework": "create-react-app"
}
