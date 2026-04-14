// Relative import avoids circular dependency (vitest-config depends on oxlint-config)
import { configureEndToEndPackage } from '../vitest-config/src/configure-e2e.ts';

export default configureEndToEndPackage();
