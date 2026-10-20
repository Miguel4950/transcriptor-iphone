# Transcriptor — iPhone Pro Edition 

Aplicación dedicada 100% a **iPhone (iOS 16 / 17 / 18+)** con estética **Apple OLED Full Black**, impulsada por **Groq `whisper-large-v3`**.

## Características exclusivas para iPhone
1. **Píldora Dynamic Island Interactiva**: Situada en la parte superior del iPhone (y arrastrable por toda la pantalla) con onda de voz a 60 FPS, botones de empezar/finalizar (`●`), seguir grabando/pausar (`+`) y copiado rápido.
2. **Píldora Flotante Picture-in-Picture (`⧉`) sobre WhatsApp**: Saca la píldora fuera de Safari mediante stream Retina + pista WebAudio para que flote encima de WhatsApp, Notas o Instagram, permitiendo detener y transcribir tocando Pausa (`❚❚`) en la ventana flotante.
3. **Integración Nativa con Atajos de iOS (Apple Shortcuts + Back Tap)**: Endpoint `/api/transcribe?format=text` con detección automática de binarios nativos de iPhone (`.m4a`, `.mp4`, `.wav` y `multipart/form-data`) para transcribir desde la **Dynamic Island real de iOS** tocando 2 veces la parte trasera del iPhone sin abrir Safari.
4. **Protección total en grabaciones largas**: Corte automático cada 2 minutos (`< 22 MB`), autoguardado progresivo por tramo, filtro de silencio por tramo y 4 reintentos exponenciales.
5. **Cero API Keys Hardcodeadas**: Usa `GROQ_API_KEY` en las variables de entorno de Vercel o configúrala localmente en el llavero del navegador del iPhone.
