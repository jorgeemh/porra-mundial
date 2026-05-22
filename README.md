# Porra Mundial 2026 ⚽

Web estática para una porra del Mundial 2026 entre amigos. Hospedada gratis en GitHub Pages, con Supabase como base de datos.

## Cómo está montado

- **HTML + CSS + JavaScript puros** (sin frameworks). Todo corre en el navegador del visitante.
- **Supabase** guarda usuarios, partidos y pronósticos.
- **Identificación:** nombre + PIN de 4 dígitos. La verificación se hace dentro de Supabase con bcrypt.
- **Seguridad:** solo se usa la `anon key` pública en la web. Los pin_hash y session_token nunca se exponen — los accesos van por funciones RPC `SECURITY DEFINER`.

## Estructura

```
porra-mundial/
├── index.html              login / registro
├── pronosticos.html        pantalla principal del usuario
├── clasificacion.html      tabla de aciertos y detalle
├── admin.html              tu panel de admin
├── css/styles.css
├── js/
│   ├── config.js           ← AQUÍ pegas las claves y el sistema de puntos
│   ├── supabase.js
│   ├── partidos.js
│   ├── clasificacion.js
│   └── admin.js
├── data/
│   ├── partidos.json       calendario (edítalo cuando FIFA publique fechas reales)
│   └── bracket.json        plantilla de cruces eliminatorios
└── supabase_schema.sql     SQL que ejecutas una sola vez en Supabase
```

---

# Instalación paso a paso

## PASO 1 — Configurar Supabase

1. Entra en tu proyecto de Supabase → **SQL Editor** → **New query**.
2. Abre el archivo `supabase_schema.sql` de este proyecto, copia **todo el contenido** y pégalo en el editor.
3. Pulsa **Run** (abajo a la derecha). Debería decir "Success" sin errores.
4. Ve a **Project Settings → API**. Copia dos valores:
   - **Project URL** (algo como `https://abcd1234.supabase.co`)
   - **anon public key** (una cadena larga que empieza por `eyJ...`)
5. Abre `js/config.js` en este proyecto y pega esos dos valores en su sitio:
   ```js
   SUPABASE_URL: "https://abcd1234.supabase.co",
   SUPABASE_ANON_KEY: "eyJ...",
   ```

⚠️ **NUNCA** pegues la `service_role` key. Solo la `anon`.

## PASO 2 — Crearte como administrador

1. Abre `index.html` en local (doble clic) o sube primero a GitHub (Paso 3) y abre la URL.
2. Pulsa "Soy nuevo (registrarme)", pon tu nombre y un PIN.
3. Vuelve a Supabase → **Table Editor → usuarios**. Busca tu fila y marca `es_admin = true`. Guarda.
4. Cierra sesión en la web (botón "Salir") y vuelve a entrar. Ya verás el enlace **Admin**.

## PASO 3 — Subir a GitHub Pages

### Opción A: desde la web de GitHub (sin terminal)
1. En GitHub, crea un repositorio nuevo, por ejemplo `porra-mundial`. Hazlo **público**.
2. En la página del repo, pulsa **Add file → Upload files**.
3. Arrastra **todas** las carpetas y archivos de este proyecto (incluye `index.html`, las carpetas `css`, `js`, `data`, etc.). El archivo `supabase_schema.sql` puedes subirlo o no — no afecta a la web.
4. Pulsa **Commit changes**.
5. Ve a **Settings → Pages**:
   - En "Source", elige **Deploy from a branch**.
   - Branch: `main`, carpeta `/ (root)`. Guarda.
6. Espera 1-2 minutos. GitHub te dará una URL del tipo `https://tu-usuario.github.io/porra-mundial/`. Esa es la que mandas a tus amigos.

## PASO 4 — Cargar el calendario en la base de datos

1. Entra en la web con tu usuario admin → pestaña **Admin**.
2. Pulsa **"Cargar partidos.json en la base de datos"**. Se crearán los 72 partidos de la fase de grupos.

## PASO 5 — Cuando se sepan los equipos reales

El archivo `data/partidos.json` lleva por ahora **placeholders** (`A1`, `A2`, `B2`...) excepto los anfitriones (MEX, USA, CAN). Cuando se sepan los equipos reales (sorteo FIFA), edita ese archivo en GitHub:
- Sustituye `A2`, `A3`, ... por los nombres reales (`ESP`, `BRA`, `ARG`...). Usa **abreviaturas de 3 letras** para que se vea bien en el móvil.
- Ajusta `fecha_hora` si cambian (formato: `2026-06-11T20:00:00+02:00`, en hora española).
- Ajusta `fecha_limite_grupos` para que sea la hora del primer partido del Mundial (hora española).
- Tras subir los cambios a GitHub, vuelve a **Admin → Cargar partidos.json**.

📅 **Calendario oficial:** lo encuentras en https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026

---

# Cómo funciona la porra (uso normal)

## Para tus amigos
1. Abren la URL de GitHub Pages.
2. Pulsan "Soy nuevo", ponen su nombre + PIN.
3. En **Pronósticos** marcan ganador o empate en cada partido de grupos. Cada cambio se guarda al instante.
4. Cuando se cierre la fase de grupos (al empezar el primer partido del Mundial), no podrán cambiar más.
5. Cuando tú generes el bracket, podrán rellenar de una sola vez su cuadro eliminatorio.
6. En **Clasificación** ven la tabla general y los pronósticos de cualquiera.

## Para ti (admin)
- **Cada partido de grupos:** vas a Admin → grupo correspondiente, metes goles A y B, **Guardar**. La web calcula resultado y recalcula puntos automáticamente.
- **Tras el último partido de grupos:** Admin → **Generar cuadro eliminatorio**. La web calcula clasificaciones, elige 8 mejores terceros y crea los 16 cruces de dieciseisavos.
- **Antes del primer partido eliminatorio:** Admin → **Bloquear bracket**. A partir de ahí nadie puede cambiar su cuadro.
- **Cada partido eliminatorio:** Admin → ronda → elige ganador, **Guardar**. El ganador se propaga automáticamente al siguiente partido.
- **Si alguien olvida su PIN:** Admin → Usuarios → **Resetear PIN**, le pones uno nuevo y se lo dices.

## Sistema de puntos (editable en `js/config.js`)
- Fase de grupos: **1 punto** por acierto.
- Dieciseisavos: **2 puntos** por cada equipo que adivines que pasa a octavos.
- Octavos: **3** · Cuartos: **5** · Semis: **7** · Campeón: **10**.

Para cambiarlo, edita los números en `js/config.js`, sube el archivo a GitHub y listo.

---

# Preguntas frecuentes

**¿Y si quiero meter más admins?** Admin → Usuarios → "Hacer admin" junto al nombre de tu amigo.

**¿Puedo usar la anon key sin riesgo?** Sí, está diseñada para eso. La seguridad real está en las políticas RLS y en que las funciones de escritura exigen el `session_token`.

**¿Y si la plantilla de cruces del bracket no coincide con la oficial de FIFA?** Edita `data/bracket.json` y cambia los `slot_a` / `slot_b` de R32 según el cruce real (por ejemplo `"1A" vs "3W3"`). La estructura `next_match`/`from_a`/`from_b` no se debe tocar.

**¿Y si quiero borrar todo y empezar de cero?** En Supabase → SQL Editor → `truncate usuarios, partidos, pronosticos cascade;` y vuelves a ejecutar la sección de `insert into config` del schema.
