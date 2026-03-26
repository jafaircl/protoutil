---
title: "@protoutil/angular"
description: Angular components and validators for AIP-160 and protovalidate
---

Angular components and validators for working with [AIP-160](https://aip.dev/160) filter expressions and [protovalidate](https://github.com/bufbuild/protovalidate) message validation. Built on Angular signals, Angular Material, and `@protoutil/aip`.

## Install

```bash
npm install @protoutil/angular
```

### Peer Dependencies

| Package | Version |
|---------|---------|
| `@angular/common` | `^21.2.0` |
| `@angular/core` | `^21.2.0` |
| `@angular/forms` | `^21.2.0` |
| `@bufbuild/protobuf` | `^2.11.0` |
| `@bufbuild/protovalidate` | `^1.1.1` |
| `@protoutil/aip` | `*` |

The filter tree components also use `@angular/cdk` (drag-drop) and `@angular/material` (form fields, buttons, icons, select, etc.).

## Filter Editor

The `<aip-filter-editor>` component provides a full-featured UI for building AIP-160 filter expressions. It combines a visual tree editor with both a guided stepper input and a free-text input.

```html
<aip-filter-editor
  [declarations]="declarations"
  [initialTree]="initialTree"
  [initialField]="'status'"
  [initialInputMode]="'stepper'"
  (treeChange)="onTreeChange($event)"
/>
```

| Input | Type | Description |
|-------|------|-------------|
| `declarations` | `Decl[]` | Field declarations for type-aware operator selection and validation |
| `initialTree` | `FilterNode` | Optional initial tree state |
| `initialField` | `string \| null` | Pre-select a field in the stepper |
| `initialInputMode` | `'stepper' \| 'text'` | Which input mode to show initially (default: `'stepper'`) |

| Output | Type | Description |
|--------|------|-------------|
| `treeChange` | `FilterNode` | Emitted after every tree mutation |

### Input Modes

The editor supports two input modes, togglable via icon buttons:

- **Stepper mode**: A guided field → operator → value flow. Operators are determined by the field's CEL type (e.g., strings get `contains`/`startsWith`/`endsWith`, numbers get comparison operators).
- **Text mode**: A free-text input with real-time AIP filter validation (debounced, type-checked).

## Filter Tree

The `<aip-filter-tree>` component renders a drag-and-drop filter tree with undo/redo support.

```html
<aip-filter-tree
  [initialTree]="rootNode"
  (treeChange)="onTreeChange($event)"
/>
```

Features:
- **Drag and drop**: Reorder filters and nest them into AND/OR groups using CDK drag-drop
- **Conjunction toggle**: Click a branch header to toggle between AND and OR
- **Delete nodes**: Remove individual filter conditions or entire groups
- **Undo/Redo**: Keyboard shortcuts (`Cmd/Ctrl+Z`, `Cmd/Ctrl+Shift+Z`) and programmatic API
- **Clear all**: Reset the tree to an empty state

## Filter Node Model

The `FilterNode` data model represents filter expressions as a tree:

```typescript
import {
  createFilterLeafNode,
  createFilterBranchNode,
  exprToFilterNode,
  filterNodeToExpr,
  isFilterNode,
  isFilterLeafNode,
  isFilterBranchNode,
  cloneNode,
} from "@protoutil/angular";
```

- **Leaf nodes** hold a single `Expr` (a filter condition like `status = "active"`)
- **Branch nodes** hold child nodes and a conjunction (`_&&_` for AND, `_||_` for OR)

### Converting between Expr and FilterNode

```typescript
import { parse, check, unparse } from "@protoutil/aip/filtering";
import { exprToFilterNode, filterNodeToExpr } from "@protoutil/angular";

// Parse a filter string into an Expr, then convert to a FilterNode tree
const { checkedExpr } = check(parse('status = "active" AND rating > 3'));
const tree = exprToFilterNode(checkedExpr.expr!);

// Convert back to an Expr and unparse to a filter string
const expr = filterNodeToExpr(tree);
const filterString = unparse(expr!);
```

## Filter Tree Service

`FilterTreeService` is an injectable service that provides immutable tree manipulation:

```typescript
import { FilterTreeService } from "@protoutil/angular";
```

| Method | Description |
|--------|-------------|
| `applyDrop(root, dragId, position)` | Apply a drag-and-drop operation |
| `toggleConjunction(root, branchId)` | Toggle a branch between AND and OR |
| `deleteNode(root, nodeId)` | Remove a node from the tree |
| `initHistory(root)` | Create a fresh undo/redo history |
| `commitState(history, newRoot)` | Push a new state onto the history stack |
| `undo(history)` | Step back one state |
| `redo(history)` | Step forward one state |
| `currentRoot(history)` | Get the tree at the current history position |
| `canUndo(history)` / `canRedo(history)` | Check if undo/redo is available |

## Filter Operators

`operatorsForType` returns the available filter operators for a given CEL type:

```typescript
import { operatorsForType, valueInputKindForType } from "@protoutil/angular";

const ops = operatorsForType(stringType);
const inputKind = valueInputKindForType(intType); // "number"
```

| CEL Type | Available Operators |
|----------|-------------------|
| `BOOL` | `=`, `!=` |
| `INT64`, `UINT64`, `DOUBLE` | `=`, `!=`, `<`, `<=`, `>`, `>=` |
| `STRING` | `=`, `!=`, `contains`, `startsWith`, `endsWith` |
| `TIMESTAMP`, `DURATION` | `=`, `!=`, `<`, `<=`, `>`, `>=` |

## Validators

### validateAipFilter

An Angular signal forms validator for AIP filter strings:

```typescript
import { validateAipFilter } from "@protoutil/angular";

const filterForm = form(signal(""), (path) => {
  debounce(path, 300);
  validateAipFilter(path, () => declarations);
});
```

### validateMessageTree

Integrates [protovalidate](https://github.com/bufbuild/protovalidate) with Angular signal forms:

```typescript
import { validateMessageTree } from "@protoutil/angular";

validateMessageTree(formPath, validator, MyMessageSchema);
```

## Internationalization

All UI labels use Angular's `$localize` for i18n support. The following message IDs are available:

| ID | Default | Used In |
|----|---------|---------|
| `@@filterOperator.equals` | equals | Stepper operator select |
| `@@filterOperator.notEquals` | not equals | Stepper operator select |
| `@@filterOperator.lessThan` | less than | Stepper operator select |
| `@@filterOperator.lessOrEqual` | less or equal | Stepper operator select |
| `@@filterOperator.greaterThan` | greater than | Stepper operator select |
| `@@filterOperator.greaterOrEqual` | greater or equal | Stepper operator select |
| `@@filterOperator.contains` | contains | Stepper operator select |
| `@@filterOperator.startsWith` | starts with | Stepper operator select |
| `@@filterOperator.endsWith` | ends with | Stepper operator select |
| `@@filterStepper.fieldLabel` | Field | Stepper labels |
| `@@filterStepper.operatorLabel` | Operator | Stepper labels |
| `@@filterStepper.valueLabel` | Value | Stepper labels |
| `@@filterStepper.addLabel` | Add | Stepper labels |
| `@@filterTextInput.placeholder` | e.g. status = "ACTIVE" ... | Text input |
| `@@filterTextInput.label` | Filter expression | Text input |
| `@@filterTextInput.submitLabel` | Add | Text input |
