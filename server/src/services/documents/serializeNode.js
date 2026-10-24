import { XMLSerializer } from '@xmldom/xmldom';

export function serializeNode(node) {
  return new XMLSerializer().serializeToString(node);
}
