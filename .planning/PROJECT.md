# Slack → ClickUp Task Bot

## What This Is

Un bot/automatización que escucha mensajes de lenguaje libre en un canal dedicado de Slack, los interpreta con IA (OpenAI) y crea tareas en ClickUp con cliente, descripción, asignados, start date, due date y links correctamente mapeados. Antes de crear, el bot postea un preview en el hilo del mensaje para que un humano confirme. También notifica de vuelta al canal cuando cambia el estatus o asignado de una tarea (bidireccional). Es para el equipo interno de Arianna Lupi (Arianna, Verónica, Juan + equipo) para centralizar tareas dispersas entre chats.

## Core Value

Convertir un mensaje libre en Slack en una tarea de ClickUp correcta y completa (cliente + asignado + fechas), sin que nadie tenga que llenar formularios a mano. Si todo lo demás falla, esto debe funcionar.

## Current Milestone: v1.1 Dynamic Config + Security Hardening

**Goal:** Eliminar la config hardcodeada leyendo clientes/miembros/mapa-Slack en vivo desde ClickUp (cacheado en Redis con TTL), y endurecer la app contra OWASP Top 10.

**Target features:**
- Clientes dinámicos — opciones del dropdown "Cliente" leídas en vivo desde ClickUp, cacheadas. Agregar un cliente en ClickUp no requiere redeploy.
- Asignados dinámicos — miembros del workspace ClickUp leídos en vivo, cacheados.
- Mapa Slack→ClickUp automático — resolver Slack user → ClickUp member por email, sin hardcodear IDs de Slack.
- Auditoría OWASP Top 10 + análisis de ciberseguridad de toda la app.
- Hardening — corregir los hallazgos de la auditoría.

## Requirements

### Validated

- ✓ Bot escucha mensajes en canal Slack dedicado y los captura — v1.0
- ✓ IA (OpenAI structured outputs) parsea mensaje libre → estructura: título, descripción, cliente, asignados, start/due date, links — v1.0
- ✓ Bot resuelve "cliente" al custom field dropdown de ClickUp — v1.0
- ✓ Bot resuelve asignados via mapa Slack→ClickUp + nombres/menciones del texto — v1.0
- ✓ Bot postea preview parseado en el hilo para confirmación humana (Confirmar/Editar/Cancelar) — v1.0
- ✓ Al confirmar, bot crea la tarea en ClickUp con todos los campos + postea el link al hilo — v1.0
- ✓ Bot notifica al canal cambios de estatus/asignado (ClickUp → Slack, webhook) — v1.0
- ✓ Hardening base: errores en hilo, retry 429, kill switch — v1.0
- ✓ Desplegado en vivo en Vercel (Fluid Compute + Upstash Redis) — v1.0

### Active

<!-- v1.1 — see Current Milestone above; tracked in REQUIREMENTS.md -->

- [ ] Clientes dinámicos desde ClickUp (cacheados en Redis con TTL)
- [ ] Asignados dinámicos desde ClickUp (cacheados)
- [ ] Mapa Slack→ClickUp resuelto por email automáticamente
- [ ] Auditoría OWASP Top 10 + análisis de ciberseguridad
- [ ] Fixes de los hallazgos de seguridad

### Out of Scope

- Automatización "Read Eye Task" — pertenece a Aprendo Club, no al canal/bot de clientes
- Reporte diario SEO (rankings/GSC) — automatización separada, datos aún sin especificar
- Web Aprendo Club (página estática + Google Ads) — proyecto aparte
- Sincronizar resúmenes RIPAI de reuniones a ClickUp — fase posterior, no v1
- Crear/editar tareas fuera del canal dedicado — solo escucha el canal designado

## Context

- **ClickUp real (via MCP):**
  - Workspace id `90131720021`; space **AL Clients** id `90137923838`
  - List destino probable: **Task- Seo Team** id `901327239630` (folder SEO TEAM-OPERATIONS)
  - Custom field **Cliente** (dropdown, id `05ebdc8a-4736-404d-9132-3ab32875e1f1`): Felipe Vergara, Children Chic, Ultra1plus, FHCA, Delta/Nicmafia, Apturio, Interno
  - Otros campos útiles: `Link/Loom` (url), `TASK`, `Task Type`, `Department` (dropdowns), start_date/due_date nativos
  - Miembros (9): Arianna Lupi, Verónica Romero, Juan Carlos Angulo, Cammila Hernandez, Miguel Pacheco, Amira El Sahli, Oriana Reyes, Fernando Perez, Natalia Olivares
- Canal Slack limitado a Arianna, Verónica, Juan (+1). Usa hilos para preservar contexto/comentarios.
- Origen: reunión donde se detectó dispersión de tareas entre chats y falta de visibilidad de responsables.
- Existe MCP de ClickUp y de Slack disponibles en el entorno (útil para prototipado/lectura).

## Constraints

- **Tech stack**: Node/TypeScript — Slack Bolt SDK + ClickUp API + OpenAI SDK. Mejor encaje para bot Slack serverless.
- **Hosting**: Vercel serverless (functions). Equipo ya tiene acceso Vercel; sin servidor que mantener. (Hostinger se planteó en llamada pero se prefirió serverless.)
- **AI provider**: OpenAI para el parseo NL→estructura (structured outputs, json_schema strict). Elegido sobre Claude para no consumir créditos Claude; modelo barato tipo gpt-4o-mini/gpt-4.1-mini.
- **Timeline**: objetivo listo en julio 2026; las tareas del roadmap no deben pasar de junio según prioridad de la reunión. Integración base apuntada para "esta semana".
- **Confirmación humana**: obligatoria antes de crear tarea (preview en hilo) — evita tareas basura por mal parseo.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Flujo bidireccional en v1 | Canal debe mostrar estatus/asignado, no solo crear | — Pending |
| Confirmación preview en hilo | Evitar tareas mal parseadas; humano valida cliente/asignado/fecha | — Pending |
| Hosting Vercel serverless | Sin servidor que mantener; acceso ya disponible; webhooks fáciles | — Pending |
| Node/TypeScript + Slack Bolt | Ecosistema maduro para bots Slack en serverless | — Pending |
| AI provider OpenAI (no Claude) | Evita consumir créditos Claude; structured outputs json_schema strict equivalen al forced tool-use; gpt-4o-mini barato | — Pending |
| Cliente = custom field dropdown | ClickUp real ya usa dropdown Cliente en list Task-Seo Team | — Pending |
| Asignados: mapa fijo + nombres del texto | Robustez para el equipo + flexibilidad para menciones sueltas | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-06-18 after initialization*
