import type { Doc } from '../model/types.ts';
import { isBoardLayer } from '../model/types.ts';
import { BoardBackground } from './BoardBackground.tsx';
import { ItemView } from './ItemView.tsx';
import type { Settings } from '../store/store.ts';
import { PcbView } from './PcbView.tsx';
import { Junctions } from './Junctions.tsx';
import { isSchematicDoc } from '../model/types.ts';

/** Static rendering used for SVG/PNG export and printing. */
export function DocumentSvg({ doc, settings, mirror, zoneFills }: { doc: Doc; settings: Settings; mirror: boolean; zoneFills?: Map<string, string> }) {
  const flags = { showNames: settings.showNames, showValues: settings.showValues, showPins: false, mirror };
  return (
    <svg xmlns="http://www.w3.org/2000/svg" xmlnsXlink="http://www.w3.org/1999/xlink" width={doc.width} height={doc.height} viewBox={`0 0 ${doc.width} ${doc.height}`}>
      <g transform={mirror ? `translate(${doc.width} 0) scale(-1 1)` : undefined}>
        {doc.type === 'PCB' && <PcbView doc={doc} idPrefix="x" mirror={mirror} opts={{ ...flags, realistic: settings.pcbRealistic, zoom: 1, zoneFills }} />}
        {doc.type !== 'PCB' && [...doc.layers].reverse().map((layer) => {
          if (!layer.visible) return null;
          return (
            <g key={layer.id} opacity={isBoardLayer(layer) ? 1 : layer.opacity}>
              {isBoardLayer(layer) && (
                <BoardBackground
                  idPrefix="x"
                  width={doc.width}
                  height={doc.height}
                  type={doc.type}
                  backgroundImage={doc.backgroundImage}
                  opacity={layer.opacity}
                  grid={false}
                  solderSide={mirror}
                />
              )}
              {doc.items
                .filter((i) => i.layer === layer.id)
                .map((it) => (
                  <ItemView
                    key={it.id}
                    item={it}
                    part={it.kind === 'part' ? doc.parts[it.ref] : undefined}
                    flags={flags}
                    layerColor={it.kind === 'line' && settings.useLayerColor ? layer.color : undefined}
                    bottomLayer={layer.name.toLowerCase() === 'bottom'}
                  />
                ))}
            </g>
          );
        })}
        {doc.type !== 'PCB' && isSchematicDoc(doc) && <Junctions doc={doc} />}
      </g>
    </svg>
  );
}
