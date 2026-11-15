# Mermaid

## Flowchart

```mermaid
flowchart LR
  A[Agent writes PLAN.md] --> B{Markdown?}
  B -- yes --> C[Formatted view]
  B -- no --> D[Source view]
  C --> E((Read))
```

## Sequence

```mermaid
sequenceDiagram
  participant P as Person
  participant F as Files panel
  participant D as Disk
  P->>F: click PLAN.md
  F->>D: readTextFile
  D-->>F: text
  F-->>P: formatted view
  Note over F,D: re-read on folder change
```

## State

```mermaid
stateDiagram-v2
  [*] --> Tree
  Tree --> Formatted: click .md
  Formatted --> Source: switch
  Source --> Formatted: switch
  Formatted --> Tree: back
  Tree --> [*]
```

## Class

```mermaid
classDiagram
  class View {
    +init(props, cx)
    +render(cx)
  }
  class Files {
    -Map entries
    +show(path, cx)
    +refresh(cx)
  }
  View <|-- Files
```

## ER

```mermaid
erDiagram
  SPACE ||--o{ TAB : has
  TAB ||--|{ PANE : splits
  PANE }o--|| TERMINAL : shows
```

## XY chart

```mermaid
xychart-beta
  title "Render time"
  x-axis [basics, tables, code, long]
  y-axis "ms" 0 --> 120
  bar [12, 18, 25, 110]
  line [12, 18, 25, 110]
```

## Unsupported type (falls back to source)

```mermaid
gantt
  title Phases
  dateFormat YYYY-MM-DD
  section Build
  Phase 0 :a1, 2026-11-15, 1d
  Phase 1 :after a1, 3d
```

## Syntax error (falls back to source)

```mermaid
flowchart LR
  A -->
  --> B [[[
```

## A mermaid fence inside a longer fence stays code

````markdown
```mermaid
flowchart LR
  ShouldNot --> BeDrawn
```
````

## Tilde fence

~~~mermaid
flowchart TD
  Tilde --> Works
~~~

## Indented fence in a list

1. A step with a diagram:

   ```mermaid
   flowchart LR
     Indented --> Fence
   ```

2. The next step.

## Unclosed fence (stays Markdown to the end)

```mermaid
flowchart LR
  Never --> Closed
