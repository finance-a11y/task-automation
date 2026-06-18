# Slack → ClickUp Task Bot

## What This Is

Un bot/automatización que escucha mensajes de lenguaje libre en un canal dedicado de Slack, los interpreta con IA (OpenAI) y crea tareas en ClickUp con cliente, descripción, asignados, start date, due date y links correctamente mapeados. Antes de crear, el bot postea un preview en el hilo del mensaje para que un humano confirme. También notifica de vuelta al canal cuando cambia el estatus o asignado de una tarea (bidireccional). Es para el equipo interno de Arianna Lupi (Arianna, Verónica, Juan + equipo) para centralizar tareas dispersas entre chats.

## Core Value

Convertir un mensaje libre en Slack en una tarea de ClickUp correcta y completa (cliente + asignado + fechas), sin que nadie tenga que llenar formularios a mano. Si todo lo demás falla, esto debe funcionar.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Bot escucha mensajes en canal Slack dedicado y los captura
- [ ] IA (Claude) parsea mensaje libre → estructura: título, descripción, cliente, asignados, start/due date, links
- [ ] Bot resuelve "cliente" al custom field dropdown de ClickUp (7 opciones existentes)
- [ ] Bot resuelve asignados via mapa fijo Slack→ClickUp + resolución de nombres sueltos del texto
- [ ] Bot postea preview parseado en el hilo del mensaje para confirmación humana
- [ ] Al confirmar, bot crea la tarea en ClickUp en la list destino con todos los campos
- [ ] Bot postea link de la tarea creada de vuelta al hilo
- [ ] Bot notifica al canal cambios de estatus/asignado de tareas (ClickUp → Slack, via webhook)

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
