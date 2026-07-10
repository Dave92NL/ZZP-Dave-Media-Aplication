# đź“ QUALITY.md - Code Style & Maintainability Metrics

## đź“Ź 1. Code Metrics
- **Module File Cap:** No single code script file may exceed **300 lines of code**. If execution logic crosses this parameter, modularize components immediately.
- **Coupling Standards:** Enforce strict separation of layers. Keep UI presentation decoupled from data parsing wrappers.

## đź”  2. Typing & Architecture
- **Node.js Environment:** Use clean ECMAScript Modules (ESM). Apply explicit JSDoc annotations for all functions, inputs, and return states.
- **Python Pipeline:** Strict, native type hints (\rom typing import ...\) are mandatory across all modules.
- **Localization:** Code documentation and terminal logs must be built in **English**.