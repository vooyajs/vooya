import type { CodegenComponent } from "./types.js";

/**
 * Version of the contract shared by the compiler-generated WASM bindings and
 * the framework runtime. The compiler embeds this value in the generated
 * `voo_abi_version()` WASM export; the runtime reads that export before mount
 * and rejects a mismatched value. Increment it only for an incompatible
 * change to generated exports, prop/event marshaling, or lifecycle handles.
 */
export const VOO_ABI_VERSION = 1;

export function publicAbiTypeDiagnostic(rustType: string, location: string): string | undefined {
  if (isBorrowedStringType(rustType)) {
    return (
      `Unsupported Voo public ABI type "${rustType}" for ${location}. ` +
      "Use owned String."
    );
  }
  if (/^[iu](?:64|128)$/.test(rustType)) {
    return (
      `Unsupported Voo public ABI type "${rustType}" for ${location}. ` +
      "Use a supported 32-bit numeric type or expose this value as a String."
    );
  }
  return undefined;
}

export function assertSupportedPublicAbiType(rustType: string, location: string): void {
  const diagnostic = publicAbiTypeDiagnostic(rustType, location);
  if (diagnostic) {
    throw new Error(diagnostic);
  }
}

export function validatePublicAbi(component: CodegenComponent): void {
  for (const prop of component.props) {
    assertSupportedPublicAbiType(prop.rustType, `prop "${prop.name}"`);
  }
  for (const event of component.events) {
    for (const parameter of event.parameters) {
      assertSupportedPublicAbiType(
        parameter.rustType,
        `event "${event.name}" parameter "${parameter.name}"`,
      );
    }
  }
}

function isBorrowedStringType(rustType: string): boolean {
  return /^(?:&(?:\s*'[a-zA-Z_]\w*)?\s*str|str)$/.test(rustType.trim());
}

