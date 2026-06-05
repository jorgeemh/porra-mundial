# 🏆 Cómo montar tu propia Porra Mundial 2026

**Guía para no-técnicos.** Si no has tocado código en tu vida, esta guía es para ti. Sigue los pasos en orden, no te saltes ninguno, y tendrás tu propia porra funcionando en aproximadamente **1 hora**.

---

## 📋 ¿Qué vas a hacer? (resumen)

Vas a copiar una aplicación web ya construida (la "Porra Mundial 2026") y a montarla con tu propio dominio y tu propia base de datos para que tú y tus amigos podáis hacer vuestra porra independiente de cualquier otro grupo.

**Lo que necesitas:**
- Un ordenador con navegador (Chrome, Firefox, Safari...)
- Un email
- Una hora libre
- **Cero conocimientos técnicos** (te lo explico todo)

**Lo que vas a obtener al final:**
- Una web propia (algo como `tu-porra.vercel.app`) donde tú y tus amigos podéis hacer pronósticos
- Una base de datos solo para tu grupo
- Un panel de administración para meter resultados
- Todo **gratis**, sin tarjeta ni nada

---

## 🛒 Cuentas que necesitas crear (todas gratis)

Antes de empezar, créate cuenta en estos 3 servicios. Tarda 5 min en total:

| Servicio | Para qué sirve | Link |
|---|---|---|
| 🐙 **GitHub** | Donde vivirá el código | https://github.com/signup |
| 🗄️ **Supabase** | Tu base de datos | https://supabase.com (botón "Start your project") |
| 🚀 **Vercel** | Para publicar la web | https://vercel.com/signup (usa "Continue with GitHub") |

**💡 Truco**: cuando te registres en Vercel, elige "Sign up with GitHub". Así se conectan los dos servicios automáticamente.

---

# PARTE 1 — Conseguir el código (5 min)

## Paso 1.1: Hacer una copia del código (fork)

1. Abre en tu navegador: **https://github.com/jorgeemh/porra-mundial**

2. Arriba a la derecha verás un botón blanco que pone **"Fork"** con un número al lado. **Haz click** ahí.

3. Te llevará a una página llamada "Create a new fork". No cambies nada. Solo pulsa el botón verde **"Create fork"** abajo.

4. Espera 5 segundos. Ahora la URL del navegador habrá cambiado a algo tipo:
   ```
   https://github.com/TU-USUARIO/porra-mundial
   ```
   ¡Eso es tu copia! Ya tienes el código en tu cuenta.

✅ **Verificación**: en la parte superior izquierda debe poner **tu nombre de usuario / porra-mundial**, no "jorgeemh / porra-mundial".

---

# PARTE 2 — Crear la base de datos en Supabase (15 min)

La base de datos es donde se guardan los usuarios, las predicciones y los resultados.

## Paso 2.1: Crear el proyecto

1. Entra en https://supabase.com/dashboard y haz login.

2. Pulsa el botón verde **"New project"**.

3. Te pide rellenar 4 cosas:
   - **Organization**: deja la que viene por defecto (tu nombre)
   - **Project name**: pon `porra-mundial` (o lo que quieras, da igual)
   - **Database Password**: ⚠️ Genera una contraseña fuerte y **guárdala en algún sitio**. Si la pierdes no es grave, no la vas a necesitar para usar la web.
   - **Region**: elige **West EU (Ireland)** o **Central EU (Frankfurt)** (más cerca = más rápido)

4. Pulsa el botón **"Create new project"** abajo.

5. **Espera 2-3 minutos** (no toques nada, deja la pestaña abierta) mientras Supabase prepara tu base de datos. Verás unos puntitos cargando.

## Paso 2.2: Apuntar dos valores importantes

Cuando termine de cargar, te llevará al panel del proyecto.

1. En el menú izquierdo, baja hasta el icono de un engranaje ⚙️ que pone **"Project Settings"**. Haz click.

2. Dentro, en el menú secundario que aparece, busca y pulsa **"API"**.

3. Verás varios datos. Apunta estos dos en un bloc de notas que tengas abierto (los necesitarás en el Paso 3):

   📝 **Project URL**: algo tipo `https://abcdefghijkl.supabase.co`

   📝 **API Keys → "anon public"**: una cadena larga que empieza por `sb_publishable_...` o `eyJ...`. **Pulsa el botón "Copy"** que aparece al lado.

   > Si te pregunta de "legacy" vs "new keys", elige la nueva (la que pone `sb_publishable_...`).

## Paso 2.3: Ejecutar los SQL (la parte más larga, pero fácil)

Ahora tienes que crear las tablas y funciones en la base de datos. Esto se hace ejecutando 9 archivos SQL en orden.

1. En el menú izquierdo de Supabase, busca el icono **"SQL Editor"** (parece un `>_`). Pulsa.

2. Verás una pantalla con un editor en blanco y un botón verde **"Run"** arriba a la derecha.

3. **Abre en otra pestaña** del navegador la siguiente URL (es tu propio repo en GitHub):
   ```
   https://github.com/TU-USUARIO/porra-mundial
   ```
   (sustituye TU-USUARIO por el tuyo).

4. Vas a copiar y ejecutar 9 archivos, uno por uno, **EN ESTE ORDEN EXACTO**:

   | Orden | Archivo | Qué hace |
   |---|---|---|
   | 1 | `supabase_schema.sql` | Crea las tablas base |
   | 2 | `supabase_patch_01.sql` | Arregla un bug del login |
   | 3 | `supabase_patch_02.sql` | Arregla otro bug del PIN |
   | 4 | `supabase_patch_03.sql` | Activa el modo prueba |
   | 5 | `supabase_patch_04.sql` | Permite editar partidos eliminatoria |
   | 6 | `supabase_patch_05.sql` | Permite bloquear grupos manualmente |
   | 7 | `supabase_patch_06.sql` | Cierre por partido individual |
   | 8 | `supabase_patch_07.sql` | Pronóstico de goleador + MVP |
   | 9 | `supabase_patch_08.sql` | Permite el bot automático |

5. **Para cada uno de los 9 archivos**, repite estos 4 pasos:
   1. En GitHub, click en el nombre del archivo (ej. `supabase_schema.sql`)
   2. Verás el contenido del archivo. Pulsa el botón **"Copy raw file"** (los dos cuadrados arriba a la derecha)
   3. Vuelve a la pestaña de Supabase (SQL Editor). **Borra todo** lo que haya en el editor.
   4. Pega lo que copiaste (Ctrl+V / Cmd+V) y pulsa el botón verde **"Run"** arriba a la derecha.
   5. Espera a ver el mensaje **"Success. No rows returned"** abajo. Si lo ves → ✅ adelante con el siguiente archivo.

> ⚠️ **Importante**: hazlo en ORDEN. Si te saltas uno o cambias el orden, algunos darán error.

> 💡 **Si te aparece un error**: léelo. Suele decir qué falta. Lo más común es haberlo ejecutado dos veces. Si no entiendes el error, pasa a tu amigo (el que te pasó esta guía) o crea un Issue en el repo original.

## Paso 2.4: Verificar que la BD está bien

Cuando hayas terminado los 9 archivos, ejecuta esta query final para comprobar que todo está OK:

```sql
select count(*) as funciones from information_schema.routines
where routine_schema='public' and routine_name like '%pronostico%' or routine_name like 'admin_%';
```

Si te devuelve un número **mayor de 15** → ✅ todo bien.

---

# PARTE 3 — Configurar el código con tu base de datos (5 min)

Ahora hay que decirle al código de la web a qué base de datos conectarse.

## Paso 3.1: Editar el archivo de configuración

1. Vuelve a tu repo de GitHub (`https://github.com/TU-USUARIO/porra-mundial`).

2. Navega a la carpeta **`js`** (haz click en ella).

3. Dentro, haz click en el archivo **`config.js`**.

4. Verás el contenido del archivo. Arriba a la derecha hay un icono de **lápiz** ✏️ ("Edit this file"). Haz click.

5. Verás dos líneas que tienes que cambiar:

   ```js
   SUPABASE_URL: "https://weejlbmvgawixgjvvokj.supabase.co",
   SUPABASE_ANON_KEY: "sb_publishable_u5_1_dsnza42-yyjqjdCNQ_Y4iS87hc",
   ```

   **Sustituye los valores entre comillas** por los tuyos (los que apuntaste en el Paso 2.2):

   ```js
   SUPABASE_URL: "https://AQUÍ-TU-URL.supabase.co",
   SUPABASE_ANON_KEY: "AQUÍ-TU-KEY",
   ```

   ⚠️ **Importante**: mantén las comillas dobles `"` y la coma `,` al final.

6. Baja al final de la página. Verás un cuadro verde con **"Commit changes..."**. Pulsa el botón verde **"Commit changes"**.

7. Aparecerá un popup. No cambies nada. Pulsa otra vez el botón verde **"Commit changes"**.

✅ Ya está. El código sabe a qué base de datos conectarse.

---

# PARTE 4 — Publicar la web con Vercel (10 min)

## Paso 4.1: Conectar GitHub con Vercel

1. Entra en https://vercel.com/dashboard.

2. Si no entraste con GitHub, te pedirá conectarlo. Acepta los permisos que pide.

3. En tu dashboard, pulsa el botón **"Add New..."** arriba a la derecha → **"Project"**.

4. Verás una lista de tus repos de GitHub. Busca **`porra-mundial`** y pulsa el botón **"Import"** al lado.

## Paso 4.2: Configurar el deploy

Te pedirá rellenar un formulario. **No cambies nada de lo que viene por defecto**, salvo si quieres:

- **Project Name**: lo que viene (`porra-mundial`) está bien. Si quieres cambiarlo, ten en cuenta que será parte de tu URL final.
- **Framework Preset**: dejará "Other" o "Vite". Cualquiera vale, pero idealmente déjalo en **"Other"** (es HTML/JS estático).
- **Root Directory**: déjalo en `./`
- **Build Command**: déjalo vacío
- **Output Directory**: déjalo vacío

Pulsa el botón negro **"Deploy"** abajo.

## Paso 4.3: Esperar

Verás una pantalla con confeti 🎉 (literal) cuando termine, en unos 30 segundos.

Pulsa el botón **"Continue to Dashboard"**.

✅ Tu URL final es algo como:
```
https://porra-mundial-TU-USUARIO.vercel.app
```

**Ábrela en otra pestaña**. Verás la pantalla de login de la porra. ¡Está viva!

> 💡 **Bonus**: Cada vez que hagas un cambio al código en GitHub, Vercel lo redespliega solo. No tienes que repetir este paso.

---

# PARTE 5 — Crearte como administrador (10 min)

Ahora hay que decirle a la base de datos que tú eres el jefe.

## Paso 5.1: Crear tu cuenta

1. Abre tu web (`https://porra-mundial-TU-USUARIO.vercel.app`).

2. Verás un formulario con dos campos (Nombre y PIN). Como es la primera vez, pulsa la pestaña **"✨ Soy nuevo"** arriba.

3. Rellena:
   - **Tu nombre**: el nombre que quieras (ej. "Pepe", "Manolo"...)
   - **PIN**: 4 dígitos. **Apúntalo** porque lo usarás siempre.

4. Pulsa **"Crear mi cuenta"**.

5. Te llevará a la página de pronósticos. Ya estás dentro como usuario normal.

## Paso 5.2: Promocionarte a admin

1. Vuelve a Supabase (https://supabase.com/dashboard, tu proyecto, **SQL Editor**).

2. Borra lo que haya en el editor y pega esto (cambiando `TU_NOMBRE` por el que pusiste arriba, manteniendo las comillas):

   ```sql
   update usuarios set es_admin = true where lower(nombre) = lower('TU_NOMBRE');
   ```

3. Pulsa **"Run"**.

4. Debe decir **"Success. No rows returned"** y abajo a la derecha **"1 row affected"**.

## Paso 5.3: Recargar la sesión

1. Vuelve a tu web.

2. Arriba a la derecha pulsa **"Salir"**.

3. Vuelve a entrar con tu nombre + PIN.

4. ✅ Ahora en el menú superior verás un enlace nuevo: **"Admin"**. Si lo ves, eres admin.

## Paso 5.4: Cargar el calendario

1. Click en **"Admin"**.

2. La primera sección dice "1) Cargar calendario". Pulsa el botón **"Cargar partidos.json en la base de datos"**.

3. Espera unos segundos. Verás un mensaje verde "Calendario cargado ✅".

4. Baja un poco. Verás los 72 partidos de la fase de grupos listos.

🎉 **¡Ya está lista para usar!**

---

# PARTE 6 — Invitar a tus amigos (1 min)

Comparte tu URL de Vercel:
```
https://porra-mundial-TU-USUARIO.vercel.app
```

Cada amigo entra, pulsa **"Soy nuevo"**, se crea su cuenta (nombre + PIN), y empieza a hacer su porra.

---

# 🤖 PARTE 7 (opcional) — Bot automático de resultados

Esta es una **mejora opcional**. Si no la haces, tendrás que meter cada resultado a mano desde el panel admin durante el Mundial. Si la haces, un robot lo hace solo.

Si te interesa, sigue los pasos del archivo `scripts/README_BOT.md` que está en el repo. La parte importante es:

1. Generar una clave secreta para el bot:
   - En tu Mac: abre la terminal y escribe `openssl rand -hex 32` → te da una cadena de 64 caracteres
   - En Windows: usa cualquier generador online de hex de 64 caracteres
2. Guardarla en Supabase ejecutando:
   ```sql
   update config set valor = 'TU_CLAVE_AQUI' where clave = 'bot_key';
   ```
3. Configurar 3 "secretos" en GitHub (Settings → Secrets and variables → Actions):
   - `SUPABASE_URL`: tu URL de Supabase
   - `SUPABASE_ANON_KEY`: tu key publishable de Supabase
   - `BOT_KEY`: la clave que generaste arriba
4. Probar manualmente: pestaña Actions → "Bot resultados Mundial 2026" → Run workflow → con `dry_run: true`

---

# ❓ Problemas comunes

## "La web no carga / queda en blanco"
- Comprueba el archivo `js/config.js` en GitHub. Si pegaste la URL o la key mal, no funcionará.
- Abre la consola del navegador (F12 → pestaña "Console") y mira el error. Suele decir si es URL o key.

## "Me dice 'Usuario no encontrado' al hacer login"
- ¿Estás en la pestaña correcta? Para entrar por primera vez tienes que estar en **"Soy nuevo"** (creas cuenta), después usar **"Ya tengo cuenta"** (login).

## "Ejecuté el SQL pero da error 'function does not exist'"
- ¿Ejecutaste **todos los 9 archivos** en orden? Algunos dependen de otros. Re-ejecútalos en orden desde el `01`.

## "Después de promocionarme a admin, no veo el enlace Admin"
- Cierra sesión y vuelve a entrar. La sesión necesita refrescarse.
- En Supabase, ejecuta `select nombre, es_admin from usuarios;` para verificar que `es_admin` está en `true` para tu fila.

## "Vercel no encuentra el repo"
- Asegúrate de haber dado permisos a Vercel para acceder a tu repo. Vercel → Settings → GitHub → Configure → permite acceso al repo `porra-mundial`.

---

# 💡 Personalizar (opcional)

| Qué quieres cambiar | Dónde |
|---|---|
| Nombre de la web | El `<title>` de cada archivo `.html` (6 archivos) |
| Colores | Las variables CSS al principio de `css/styles.css` (líneas 8-36) |
| Sistema de puntos | El objeto `PUNTOS` en `js/config.js` |
| Calendario / horarios | El archivo `data/partidos.json` |
| Lista de jugadores para premios | El archivo `data/jugadores.json` |
| Favicon (icono de la pestaña) | El archivo `favicon.svg` |

Cada cambio que hagas en GitHub se redespliega solo en Vercel en ~30 segundos.

---

# 📞 Ayuda

Si te quedas atascado en algún paso:

1. **Pregunta al amigo que te pasó esta guía** (él ya lo tiene montado, sabe qué hace falta).
2. Si quieres, abre un Issue en el repo original (https://github.com/jorgeemh/porra-mundial/issues) explicando qué paso te ha dado problema.

¡Mucha suerte y que gane el mejor! ⚽🏆
