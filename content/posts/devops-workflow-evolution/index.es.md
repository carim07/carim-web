---
title: "Cómo la IA Transformó mi Flujo de Trabajo como Ingeniero DevOps Senior"
date: 2025-11-18T10:00:00-07:00
lastmod: 2025-11-18T10:00:00-07:00
draft: false
author: "Carim Fadil"
authorLink: "https://carim.ar"
description: "Una reflexión sobre cómo mi flujo de trabajo DevOps ha evolucionado en el último año, pasando de codificación manual a arquitectura, planificación y revisión de código asistidas por IA."

tags: ["DevOps", "IA", "Cursor", "Flujo de Trabajo", "Productividad", "Desarrollo de Software"]
categories: ["DevOps"]

lightgallery: true

toc:
  auto: true

code:
  copy: true
  maxShownLines: 50

math:
  enable: false

mermaid: true
---

Hace seis meses, si me hubieras dicho que pasaría la mayor parte de mi tiempo arquitecturando y revisando código en lugar de escribirlo, habría sido escéptico. Sin embargo, aquí estamos. Mi flujo de trabajo como Ingeniero DevOps Senior se ha transformado fundamentalmente, y la IA ha sido el catalizador.

Esto no se trata solo de usar una nueva herramienta—se trata de un cambio completo en cómo abordo la resolución de problemas, la planificación y la ejecución. Déjame contarte qué cambió.

<!--more-->

## El Antes: Flujo de Trabajo DevOps Tradicional

Mi flujo de trabajo solía seguir un patrón bastante estándar:

{{< mermaid >}}
flowchart TD
    Start([Iniciar Tarea]) --> Investigate["🔍 Investigación"]
    Investigate --> Google[Búsqueda Google]
    Investigate --> StackOverflow[Stack Overflow]
    Investigate --> Docs[Documentación AWS]
    Investigate --> Trial["Prueba y Error"]
    
    Google --> Code["💻 Desarrollo"]
    StackOverflow --> Code
    Docs --> Code
    Trial --> Code
    
    Code --> VSCode[Editor VS Code]
    VSCode --> Manual[Codificación Manual]
    Manual --> Copilot["GitHub Copilot - Autocompletado Básico"]
    Copilot --> Review["📝 Revisión de Código"]
    
    Code --> Tasks["📋 Gestión de Tareas"]
    Tasks --> ManualJira[Tickets Manuales Jira]
    Tasks --> ManualDocs[Documentación Manual PRs]
    
    Review --> HumanReview[Revisores Humanos]
    Review --> BasicChecks[Verificaciones Básicas]
    
    HumanReview --> Done([Completado])
    BasicChecks --> Done
    
    style Investigate fill:#FFE4B5
    style Code fill:#FFB6C1
    style Tasks fill:#E0E0E0
    style Review fill:#DDA0DD
    style Manual fill:#FF6B6B
    style Done fill:#90EE90
{{< /mermaid >}}

### Investigación
- **Búsquedas en Google** para documentación, mensajes de error y soluciones
- **Inmersiones profundas en Stack Overflow**
- **Navegación por la documentación de AWS**
- Prueba y error manual

### Desarrollo
- **VS Code** como mi editor principal
- **Autocompletado asistido por IA** (GitHub Copilot) para sugerencias básicas
- **Codificación mayormente manual** con ayuda ocasional de IA
- Escribir código línea por línea, función por función

### Gestión de Tareas
- **Creación manual de tickets en Jira** y actualizaciones
- **Documentación manual** en PRs y tickets
- Mantener seguimiento de tareas en mi cabeza o notas dispersas

### Revisión de Código
- **Revisiones manuales de PRs** con revisores humanos
- Verificaciones automatizadas básicas (linting, escaneos de seguridad básicos)

Este flujo de trabajo funcionaba, pero consumía mucho tiempo. Pasaba mucho tiempo en tareas repetitivas, buscando información y escribiendo código repetitivo. La carga cognitiva era alta, y a menudo me encontraba cambiando de contexto entre investigación, codificación y documentación.

## El Ahora: Flujo de Trabajo DevOps Potenciado por IA

Avancemos hasta hoy, y mi flujo de trabajo se ve completamente diferente:

{{< mermaid >}}
flowchart TD
    Start([Iniciar Tarea]) --> Plan["📐 Planificación Asistida por IA"]
    Plan --> Markdown[Documentos Markdown]
    Plan --> AIExplore[Exploración IA del Problema]
    Plan --> StructuredPlan[Desglose Estructurado]
    
    Plan --> Investigate["🔍 Investigación Asistida por IA"]
    Investigate --> CursorAsk[Modo Ask de Cursor]
    Investigate --> AWSCLI["IA + AWS CLI"]
    Investigate --> OtherCLIs["IA + Otros CLIs"]
    
    Investigate --> Develop["💻 Desarrollo Potenciado por IA"]
    Develop --> Cursor[IDE Cursor]
    Cursor --> AILibrary["Biblioteca IA - Prompts y Patrones"]
    Cursor --> PlanMode[Modo Plan]
    Cursor --> CodeGen[Generación Inteligente]
    
    Develop --> Tasks["📋 Gestión Automatizada"]
    Tasks --> MCPs["MCPs: Jira, GitHub, etc."]
    Tasks --> GHCLI["GitHub CLI + IA"]
    Tasks --> AutoDocs[Documentación Auto]
    
    Develop --> Review["📝 Revisión Multi-Capa"]
    Review --> Bugbot[Bugbot]
    Review --> CodeQL[Escaneo CodeQL]
    Review --> CursorReview[Revisión PR Cursor]
    Review --> HumanReview["Revisión Humana - Enfoque Alto Nivel"]
    
    Review --> Done([Completado])
    HumanReview --> Done
    
    style Plan fill:#90EE90
    style Investigate fill:#87CEEB
    style Develop fill:#DDA0DD
    style Tasks fill:#FFD700
    style Review fill:#FFA07A
    style Done fill:#90EE90
    style CursorAsk fill:#FFE4B5
    style AWSCLI fill:#FFE4B5
{{< /mermaid >}}

### Investigación: Descubrimiento Asistido por IA

- **Modo Ask de Cursor** para investigaciones técnicas profundas
  - Hacer preguntas complejas sobre servicios de AWS, patrones de Terraform o decisiones de arquitectura
  - Obtener respuestas contextuales basadas en mi codebase y documentación
  - Preguntas de seguimiento para profundizar en temas específicos

- **Exploración de CLI asistida por IA** (AWS CLI, Terraform CLI, kubectl, etc.)
  - Usar IA para ayudar a construir consultas y comandos CLI complejos
  - Entender relaciones y dependencias de recursos en proveedores de nube
  - Depurar problemas de infraestructura con investigación guiada por IA
  - Generar y validar comandos CLI antes de ejecutarlos
  - Aprender nuevas herramientas CLI más rápido con asistencia de IA

### Desarrollo: De Codificar a Arquitecturar

- **Cursor** como mi IDE principal (reemplazando VS Code)
  - Generación y comprensión de código más inteligente
  - Mejor conciencia del contexto en todo el codebase
  - Integración fluida con flujos de trabajo de IA

- **Biblioteca de IA**: Una colección curada de prompts, patrones de codificación y mejores prácticas
  - **Ejemplos dorados** de patrones comunes (módulos de Terraform, funciones Lambda, etc.)
  - **Documentación del ciclo de vida del desarrollo de software**
  - **Modos de agente** para diferentes tipos de tareas (investigación, planificación, codificación, revisión)
  - Prompts reutilizables que capturan los estándares y preferencias de mi equipo

- **Enfoque de planificación primero**:
  - **Modo Plan** o prompts personalizados para arquitectar soluciones antes de codificar
  - **Documentos de planificación en Markdown** para proyectos grandes con múltiples tareas
  - Descomponer problemas complejos en pasos manejables y bien definidos
  - La IA ayuda a identificar casos límite y problemas potenciales temprano

- **Cambio de enfoque**: 
  - **Menos codificación manual**, más arquitectura y diseño
  - **Más revisión de código** y refinamiento
  - **Codificación manual solo cuando la IA no lo hace bien** (lo cual se está volviendo menos frecuente)

### Gestión de Tareas: Documentación Automatizada

- **MCPs (Model Context Protocol)** para gestión automatizada de tareas
  - Crear y actualizar tickets de Jira automáticamente
  - Generar descripciones de tareas y criterios de aceptación
  - Vincular tareas relacionadas y rastrear dependencias

- **Integración de GitHub CLI** con IA
  - Generar descripciones de PRs automáticamente
  - Crear changelogs completos
  - Documentar decisiones y compensaciones

- **Documentación en Markdown** para planificación
  - Los proyectos grandes obtienen documentos de planificación detallados en markdown
  - La IA ayuda a estructurar y organizar iniciativas complejas
  - Documentos vivos que evolucionan con el proyecto

### Revisión de Código: Asistencia Multi-Capa de IA

- **Revisiones automatizadas de PRs** con múltiples herramientas:
  - **Bugbot** para detección de bugs y calidad de código
  - **CodeQL Scanning** para vulnerabilidades de seguridad
  - **Revisión de PRs de Cursor** para arquitectura y mejores prácticas

- **Las revisiones manuales permanecen**, pero ahora:
  - Enfocarse en arquitectura de alto nivel y lógica de negocio
  - La IA maneja las verificaciones tediosas (formato, bugs comunes, problemas de seguridad)
  - Los revisores pueden enfocarse en lo que más importa

### El Cambio Más Importante: Planificación Asistida por IA

Si tuviera que elegir un cambio que haya tenido el mayor impacto, sería la **planificación asistida por IA**.

{{< mermaid >}}
flowchart TB
    subgraph Before["Antes: Planificación Manual"]
        direction LR
        B1[Problema] --> B2[Investigación Manual] --> B3[Planificación Rápida] --> B4[Empezar a Codificar] --> B5[Descubrir Problemas] --> B6[Arreglar y Retrabajar]
        
        style B1 fill:#FFB6C1
        style B2 fill:#FFB6C1
        style B3 fill:#FFB6C1
        style B4 fill:#FFB6C1
        style B5 fill:#FFB6C1
        style B6 fill:#FF6B6B
    end
    
    Before ==>|"Evolución Asistida por IA"| After
    
    subgraph After["Ahora: Planificación Asistida por IA"]
        direction LR
        A1[Problema] --> A2[IA Explora el Problema] --> A3[Genera Plan Estructurado] --> A4[Documenta en Markdown] --> A5["IA Revisa y Refina"] --> A6[Ejecuta con Confianza] --> A7[Bajo Retrabajo]
        
        style A1 fill:#90EE90
        style A2 fill:#90EE90
        style A3 fill:#90EE90
        style A4 fill:#90EE90
        style A5 fill:#90EE90
        style A6 fill:#90EE90
        style A7 fill:#87CEEB
    end
{{< /mermaid >}}

Antes, la planificación existía pero consumía mucho tiempo y a menudo estaba incompleta. Pasaba mucho tiempo investigando, creando planes básicos, y luego empezaba a codificar—solo para descubrir problemas más tarde que requerían retrabajo. Ahora, la planificación asistida por IA hace que el proceso sea más rápido, más completo y más efectivo:

1. **Usar IA para explorar el espacio del problema** - Hacer preguntas, entender restricciones, identificar incógnitas
2. **Generar un plan estructurado** - Descomponer el trabajo en tareas, identificar dependencias, estimar complejidad
3. **Documentar el plan** - Crear documentos markdown que sirven como especificaciones vivas
4. **Revisar y refinar** - Usar IA para identificar brechas, casos límite y problemas potenciales
5. **Ejecutar con confianza** - Tener un plan sólido hace que la ejecución sea mucho más fluida

Este enfoque de planificación primero ha reducido el retrabajo, detectado problemas antes y hecho que los proyectos complejos sean mucho más manejables.

## Ideas Clave y Lecciones

### 1. La IA No Reemplaza el Pensamiento—Lo Amplifica

El mayor malentendido es que la IA te hace perezoso o menos hábil. Lo opuesto es cierto. La IA maneja las tareas repetitivas y que consumen tiempo, liberándote para enfocarte en:
- Decisiones de arquitectura y diseño
- Resolución de problemas complejos
- Pensamiento estratégico
- Revisión de código y aseguramiento de calidad

### 2. La Planificación es Más Rápida y Completa

La IA no elimina la planificación—la hace más rápida y completa. Lo que solía tomar horas de investigación manual y documentación ahora sucede en minutos, permitiéndome:
- Entender el problema profundamente sin pasar horas investigando
- Diseñar la arquitectura de la solución con exploración asistida por IA
- Descomponer el trabajo en tareas claras con mejor análisis de dependencias
- Identificar riesgos y casos límite que podrían haberse pasado por alto

El resultado es mejor planificación en menos tiempo, lo cual paga dividendos a lo largo del ciclo de vida del proyecto.

### 3. La Documentación se Vuelve Viva y Útil

La documentación tradicional a menudo se vuelve obsoleta. Con documentación asistida por IA:
- Los PRs incluyen automáticamente descripciones completas
- Los tickets de Jira están bien documentados y actualizados
- Los documentos de planificación evolucionan con el proyecto
- El conocimiento se captura y es accesible

### 4. La Revisión de Código Cambia el Enfoque

Con la IA manejando muchas de las verificaciones mecánicas, los revisores humanos pueden enfocarse en:
- ¿Esto resuelve el problema correcto?
- ¿Es sólida la arquitectura?
- ¿Hay casos límite que estamos perdiendo?
- ¿Esto se alinea con nuestros objetivos a largo plazo?

### 5. La Curva de Aprendizaje es Real pero Vale la Pena

Adoptar este flujo de trabajo requirió:
- Aprender Cursor y sus características
- Construir una biblioteca de IA de prompts y patrones
- Desarrollar nuevos flujos de trabajo y hábitos
- Experimentar para encontrar qué funciona mejor

Pero la inversión ha valido la pena. Soy más productivo, produzco trabajo de mayor calidad y tengo más tiempo para los problemas interesantes y desafiantes.

## Las Herramientas Que Lo Hicieron Posible

### Herramientas de Desarrollo Principales

- **Cursor**: El IDE que hace que el desarrollo primero en IA sea natural
  - Modo Ask para investigaciones técnicas profundas
  - Modo Plan para arquitectura y diseño
  - Generación inteligente de código con contexto completo del codebase
  - Integración fluida con flujos de trabajo de IA

### Model Context Protocol (MCPs)

Los MCPs permiten que la IA interactúe con herramientas y servicios externos, automatizando flujos de trabajo que solían ser manuales:

- **ClickUp MCP**: Creación automatizada de tareas, actualizaciones y documentación en ClickUp
- **GitHub MCP**: Gestión de PRs, seguimiento de issues y operaciones de repositorio
- **Jira MCP**: Automatización de tickets, actualizaciones de estado y gestión de proyectos
- **Otros MCPs**: Integraciones personalizadas para Slack, Confluence, herramientas de monitoreo y más

### Interfaces de Línea de Comandos (CLIs)

Los CLIs se vuelven poderosos cuando se combinan con asistencia de IA:

- **AWS CLI**: La IA ayuda a construir consultas complejas, entender relaciones de recursos y depurar problemas de infraestructura
- **Terraform CLI**: Gestión de estado asistida por IA, validación de planes y operaciones de infraestructura
- **kubectl**: Operaciones de Kubernetes guiadas por IA e inspección de recursos
- **Otros CLIs**: CLIs de proveedores cloud (Azure, GCP), herramientas de infraestructura (Docker, Ansible) y herramientas personalizadas

La clave es usar IA para:
- Generar comandos CLI correctos
- Entender salidas de comandos
- Depurar errores y problemas
- Aprender nuevas herramientas CLI más rápido

### Herramientas de Calidad y Revisión de Código

- **Bugbot**: Detección automatizada de bugs y análisis de calidad de código
- **CodeQL**: Escaneo de vulnerabilidades de seguridad y análisis estático
- **Revisión PR de Cursor**: Revisión de arquitectura y verificación de mejores prácticas
- **GitHub CLI**: Descripciones automatizadas de PRs, changelogs y documentación

### Documentación y Planificación

- **Markdown**: Formato simple y poderoso para documentos de planificación y especificaciones vivas
- **GitHub CLI**: Documentación automatizada de PRs y generación de changelogs
- **MCPs**: Documentación automatizada en sistemas de gestión de tareas

## ¿Qué Sigue?

Esta evolución no está completa. Constantemente estoy refinando mis flujos de trabajo, agregando nuevos prompts a mi biblioteca de IA y encontrando nuevas formas de aprovechar la IA. Algunas áreas que estoy explorando:

- **Flujos de trabajo de planificación más sofisticados** para proyectos complejos multi-equipo
- **Mejor integración** entre documentos de planificación y gestión de tareas
- **Flujos de trabajo de revisión de código mejorados** que combinan múltiples herramientas de IA
- **Sistemas de gestión del conocimiento** que capturan y reutilizan aprendizajes

## Conclusión

La transformación de un flujo de trabajo DevOps tradicional a uno potenciado por IA ha sido profunda. Estoy pasando menos tiempo en tareas repetitivas y más tiempo en el trabajo que realmente importa: arquitectura, planificación y resolución estratégica de problemas.

Si eres un ingeniero DevOps (o cualquier ingeniero) considerando cómo la IA podría encajar en tu flujo de trabajo, mi consejo es:

1. **Comienza con una herramienta** - No intentes cambiar todo a la vez
2. **Construye tu biblioteca de IA** - Captura prompts, patrones y flujos de trabajo que funcionen
3. **Adopta la planificación** - Usa IA para ayudarte a planificar mejor, no solo a codificar más rápido
4. **Enfócate en el trabajo de alto valor** - Deja que la IA maneje las cosas repetitivas
5. **Sigue aprendiendo** - Las herramientas y capacidades están evolucionando rápidamente

El futuro de DevOps no se trata de reemplazar ingenieros con IA—se trata de ingenieros e IA trabajando juntos para construir mejores sistemas, más rápido.

---

*¿Has experimentado transformaciones similares en tu flujo de trabajo? Me encantaría escuchar sobre tu viaje. Encuéntrame en [LinkedIn](https://linkedin.com/in/carimfadil).*

