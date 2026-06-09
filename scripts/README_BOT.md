# 🤖 Bot automático de resultados — Mundial 2026

Sistema que mete los resultados de la fase de grupos automáticamente en tu Supabase,
basándose en los datos públicos de ESPN. Corre desde GitHub Actions cada 30 minutos
durante las fechas del Mundial.

---

## 📋 Setup paso a paso (solo una vez, ~15 minutos)

### 1. Ejecutar el SQL en Supabase

1. Supabase → SQL Editor → New query
2. Pega el contenido de `supabase_patch_08.sql`
3. **Run**

Esto crea la función `bot_set_resultado` y añade la clave `bot_key` en `config`.

### 2. Generar y guardar una bot key segura

En la **misma terminal donde tengas el repo abierto**:

```bash
openssl rand -hex 32
```

Te devolverá algo como `8f3a92b1c5e7d4f...` (64 caracteres). **Cópialo.**

Ahora actualiza el valor en Supabase. SQL Editor → New query:

```sql
update config set valor = 'PEGA_AQUI_TU_KEY_DE_64_CHARS' where clave = 'bot_key';
```

Run.

> ⚠️ Esta key es como una contraseña. Que solo la tengas tú y la pongas en
> los secretos de GitHub. Si crees que se ha filtrado, regenérala con
> `update config set valor = 'NUEVA_KEY' where clave = 'bot_key';`

### 3. Configurar los secretos en GitHub

1. Ve a tu repo en github.com
2. **Settings → Secrets and variables → Actions → New repository secret**
3. Crea 3 secretos (uno cada vez):

| Nombre | Valor |
|---|---|
| `SUPABASE_URL` | `https://weejlbmvgawixgjvvokj.supabase.co` (tu URL de Supabase) |
| `SUPABASE_ANON_KEY` | Tu clave anon/publishable (la que tienes en `js/config.js`) |
| `BOT_KEY` | La clave hex de 64 chars que generaste arriba |

### 4. Probar manualmente (dry-run)

Antes de esperar al Mundial, prueba que todo funciona:

1. En tu repo → pestaña **Actions**
2. Selecciona el workflow **"Bot resultados Mundial 2026"** (en la barra lateral)
3. **Run workflow** → marca `dry_run: true` → **Run workflow**
4. Mira los logs. Deberías ver algo como:

```
[2026-06-15 12:30:00] INFO: Cargados 72 partidos de grupos desde partidos.json
[2026-06-15 12:30:00] INFO: Obtenidos 0 partidos finalizados de ESPN
[2026-06-15 12:30:00] INFO: Resumen: ✅ 0 actualizados · ⚠️ 0 sin match · ❌ 0 errores · 🔵 0 dry-run
```

Si todavía no ha empezado el Mundial, no habrá partidos. **Eso está bien**.

### 5. Activar el cron

El cron `*/30 * * * *` (cada 30 min) ya está activado en `.github/workflows/bot-resultados.yml`,
pero **solo se ejecuta entre el 11 de junio y el 20 de julio de 2026** (lo controla el workflow).

Fuera de ese rango, salta sin hacer nada → no consume tus minutos de GitHub Actions.

---

## 🛠️ Mantenimiento y troubleshooting

### "No match" para un partido

Si en los logs ves cosas como:

```
⚠️  No match: ABC vs XYZ (2026-06-15T18:00:00Z)
```

significa que ESPN está dando un código de equipo que no coincide con el nuestro
o que la fecha está descuadrada. Soluciones:

1. **Código diferente**: edita `scripts/bot_resultados.py`, en el diccionario
   `ESPN_A_NUESTRO` añade el mapeo (ej. `"DRC": "COD"`).
2. **Partido aplazado**: si FIFA cambia la fecha, actualiza `data/partidos.json`
   con la nueva fecha o haz el `admin_set_resultado` a mano.

### Quiero pausar el bot temporalmente

Settings → Secrets → edita `BOT_KEY` y ponle un valor cualquiera (`paused`).
El bot empezará a fallar con "Bot key inválida" y no escribirá nada.
Cuando quieras reactivar, vuelve a poner la key correcta.

### Quiero ver qué hizo el bot la última vez

Repo → Actions → click en la última ejecución → expande el step "Ejecutar bot"
y verás los logs completos.

### El bot mete un resultado MAL

Sin problema. Ve a tu panel admin y corrige el resultado a mano.

🔒 **BLINDAJE (parche 09)**: el bot SOLO rellena partidos que aún no tienen
resultado. En cuanto un partido tiene resultado —lo metieras tú a mano o el
propio bot— el bot NO lo vuelve a tocar NUNCA, aunque ESPN diga algo distinto.
Así que tu corrección manual queda fijada para siempre.

Además, no hay que preocuparse de que se "descuadren los puntos": los puntos NO
se almacenan, se calculan en tiempo real cada vez que alguien abre la
clasificación. Corriges un resultado → todos ven los puntos correctos al instante.

---

## 🔒 Limitaciones de seguridad

- La `BOT_KEY` se guarda **encriptada** en GitHub Secrets. Solo es visible a los
  workflows del repo.
- La `bot_set_resultado` solo puede crear/modificar resultados de partidos
  existentes. No puede borrar, ni crear usuarios, ni modificar la `config`.
- Si tu repo es público, los logs de Actions son públicos. **El script no
  imprime la BOT_KEY** en ningún momento.

---

## 📅 Eliminatorias (automáticas desde el parche 09)

El bot ahora también mete los resultados de eliminatorias, una vez que hayas
pulsado "Generar cuadro eliminatorio" en el admin. Cómo funciona:

1. Lee de la base de datos los partidos de eliminatoria que ya tienen los dos
   equipos definidos y aún sin resultado.
2. Los busca en ESPN por equipos (en eliminación directa, dos equipos solo se
   enfrentan una vez, así que el emparejamiento es inequívoco).
3. Lee el campo `winner` de ESPN para saber quién pasó. **Esto incluye los
   penaltis**: si un partido acaba 1-1 y se decide en la tanda, ESPN marca como
   ganador al equipo que avanzó, y el bot lo registra correctamente.
4. Mete el ganador, que se propaga automáticamente a la siguiente ronda.

Se resuelve solo ronda a ronda: cuando acaben los dieciseisavos, en la siguiente
pasada el bot verá los octavos (ya con equipos) y los procesará.

**Lo único manual** sigue siendo pulsar "Generar cuadro eliminatorio" cuando
termine la fase de grupos (porque ahí decides tú el momento) y, al final del
torneo, marcar el goleador y MVP reales.

---

## 🧪 Probar el script localmente

```bash
cd /Users/jorgemh/Desktop/porra-mundial
export SUPABASE_URL='https://...'
export SUPABASE_ANON_KEY='sb_publishable_...'
export BOT_KEY='tu-bot-key-de-64-chars'
export DRY_RUN=1
python3 scripts/bot_resultados.py
```

Con `DRY_RUN=1` no escribe nada en Supabase, solo te dice qué partidos detectaría.
