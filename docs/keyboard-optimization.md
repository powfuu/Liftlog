Objetivo

Eliminar los timeouts de la cola del teclado y mejorar la estabilidad.

Cambios implementados

- Servicio de teclado con listeners, timeouts y logging.
- Reducción de filtros y animaciones cuando el teclado está abierto.
- Reutilización de conexión SQLite para evitar bloqueos en inicialización.
- Manejo de guardado en el modal para evitar operaciones largas durante foco.

Detalles

- KeyboardService inicializa el modo de resize nativo y añade listeners.
- Cada evento se ejecuta con tiempo máximo y registra duración y stack.
- Se añade la clase `keyboard-open` a `body` al abrir teclado.
- CSS desactiva `backdrop-filter` y animaciones en modales durante teclado.

Posibles causas raíz

- Animaciones y filtros costosos al mostrarse el teclado.
- Inicializaciones duplicadas de base de datos en hilo principal.
- Operaciones síncronas largas al cambiar foco en formularios.

Pruebas recomendadas

- Abrir/cerrar teclado rápidamente en distintas pantallas.
- Editar campos en modales con filtros activos.
- Alternar entre inputs y textareas de forma continua.

Seguimiento

- Revisar logs `[KeyboardTimeout]` y `[KeyboardEvent]` para latencias.
- Ajustar umbrales si fuese necesario.