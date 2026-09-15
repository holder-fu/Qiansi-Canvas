import { Position, useNodeId, useUpdateNodeInternals } from '@xyflow/react';
import { useEffect } from 'react';
import { getPorts } from '../../graph/nodeSpecs';
import type { AssetType, PortDef } from '../../graph/types';
import type { NodeKind } from '../nodeTypes';
import { MagneticPort } from '../../interaction/ports/MagneticPort';
import { useAppTranslation } from '../../i18n/appI18n';
import { getPortAriaLabel, type NodeTranslator } from '../../i18n/nodeI18n';

interface NodePortsProps {
  kind: NodeKind;
  nodeRef: React.RefObject<HTMLElement | null>;
  selected: boolean;
  zoom: number;
  hideInputs?: boolean;
  hideInputControl?: boolean;
  videoMode?: string;
  pluginInputType?: AssetType;
  pluginOutputType?: AssetType;
}

function portOffset(index: number, total: number): number {
  return total === 1 ? 0.5 : (index + 1) / (total + 1);
}

function renderPorts(
  ports: PortDef[],
  type: 'target' | 'source',
  position: Position.Left | Position.Right,
  props: Omit<NodePortsProps, 'kind'>,
  visible: boolean,
  t: NodeTranslator,
  centerAllPorts = false,
  showOnlyFirst = false,
  aggregateInput = false,
) {
  return ports.map((port, index) => (
    <MagneticPort
      key={`${type}-${port.id}`}
      nodeRef={props.nodeRef}
      port={port}
      type={type}
      position={position}
      offset={centerAllPorts ? 0.5 : portOffset(index, ports.length)}
      enabled={props.selected}
      visible={visible && (!showOnlyFirst || index === 0)}
      aggregateInput={aggregateInput}
      zoom={props.zoom}
      aria-label={getPortAriaLabel(port, type, t)}
    />
  ));
}

/** Render real React Flow handles directly from the node's NodeSpec. */
export function NodePorts({
  kind,
  nodeRef,
  selected,
  zoom,
  hideInputs = false,
  hideInputControl = false,
  videoMode,
  pluginInputType,
  pluginOutputType,
}: NodePortsProps) {
  const { t } = useAppTranslation();
  const nodeId = useNodeId();
  const updateNodeInternals = useUpdateNodeInternals();
  const inputs =
    kind === 'plugin'
      ? [
          {
            id: 'in',
            direction: 'in' as const,
            assetType: pluginInputType ?? 'any',
            label: '插件输入',
            labelKey: 'node.port.pluginInput',
            multiple: true,
          },
        ]
      : getPorts(kind, 'in');
  const outputs =
    kind === 'plugin'
      ? [
          {
            id: 'out',
            direction: 'out' as const,
            assetType: pluginOutputType ?? 'any',
            label: '插件输出',
            labelKey: 'node.port.pluginOutput',
          },
        ]
      : getPorts(kind, 'out');
  const props = { nodeRef, selected, zoom };
  const showVideoInputs = kind === 'video' && selected && videoMode === '视频换人物';

  useEffect(() => {
    if (!nodeId) return;
    // Collapsed inputs switch between zero-size hidden anchors and the visible
    // aggregate +, while fixed-screen-size handles change their flow dimensions
    // with zoom. Refresh React Flow's cached bounds so concrete hidden ports can
    // render committed edges and join the next connection search immediately.
    updateNodeInternals(nodeId);
  }, [
    hideInputControl,
    hideInputs,
    inputs.length,
    nodeId,
    showVideoInputs,
    updateNodeInternals,
    zoom,
  ]);

  return (
    <>
      {/* Keep one visible target + on the left and one source + on the right.
          Extra typed inputs share the centre anchor invisibly, so every edge
          stays docked at the middle of the node border. */}
      {renderPorts(
        inputs,
        'target',
        Position.Left,
        props,
        !hideInputs && !hideInputControl,
        t,
        !showVideoInputs,
        !showVideoInputs,
        !showVideoInputs,
      )}
      {renderPorts(outputs.slice(0, 1), 'source', Position.Right, props, true, t)}
    </>
  );
}
