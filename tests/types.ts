import type { Mock } from 'vitest';

/**
 * A callable mock for variables declared once and assigned `vi.fn()` in `beforeEach`.
 * `ReturnType<typeof vi.fn>` resolves to `Mock<Procedure | Constructable>`, which is
 * not assignable to function-typed props.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyMock = Mock<(...args: any[]) => any>;
