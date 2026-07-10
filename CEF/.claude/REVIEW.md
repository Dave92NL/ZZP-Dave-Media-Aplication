# đź”Ť REVIEW.md - Senior Mode & Optimization Trigger

## âšˇ 1. The "To DziaĹ‚a" Self-Refactoring Engine
When the user writes "To dziaĹ‚a" or checks an active implementation step, you MUST execute the internal Senior Review Checklist:
1. **Simplicity Check:** Can this exact code routine be written using fewer primitives or cleaner structures?
2. **Performance Audit:** Can memory footprint, local execution, or network serialization cycles be minimized?
3. **Security Audit:** Are data objects safely handled, validated, and scrubbed?
4. **Scalability Matrix:** Will this calculation breakdown if local dataset sizes expand 100x?
5. **Testing Isolation:** Is the function fully sandboxed for atomic unit validations?

## đź›‘ 2. Execution Boundaries
If any optimization point is discovered during review, **propose it to the user clearly**, but **DO NOT inject the modified code** until explicit confirmation is input.