import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { MultiSelectParam } from "./MultiSelectParam"
import type { TriggerParamSpec } from "@talos/shared/types"

interface TriggerParamEditorProps {
  params: TriggerParamSpec[]
  pluginId: string
  values: Record<string, unknown>
  onChange: (values: Record<string, unknown>) => void
}

export function TriggerParamEditor({ params, pluginId, values, onChange }: TriggerParamEditorProps) {
  function updateValue(key: string, value: unknown) {
    onChange({ ...values, [key]: value })
  }

  return (
    <div className="space-y-4">
      {params.map((param) => {
        if (param.type === "multi-select") {
          const selected = Array.isArray(values[param.key]) ? (values[param.key] as string[]) : []
          return (
            <div key={param.key} className="space-y-2">
              <Label>{param.label}</Label>
              {param.description && (
                <p className="text-xs text-muted-foreground">{param.description}</p>
              )}
              <MultiSelectParam
                param={param}
                pluginId={pluginId}
                selected={selected}
                onChange={(v) => updateValue(param.key, v)}
              />
            </div>
          )
        }

        if (param.type === "number") {
          const numValue = values[param.key] ?? param.default ?? ""
          return (
            <div key={param.key} className="space-y-2">
              <Label htmlFor={`param-${param.key}`}>{param.label}</Label>
              {param.description && (
                <p className="text-xs text-muted-foreground">{param.description}</p>
              )}
              <Input
                id={`param-${param.key}`}
                type="number"
                value={String(numValue)}
                onChange={(e) => {
                  const n = Number(e.target.value)
                  updateValue(param.key, isNaN(n) ? param.default : n)
                }}
                placeholder={param.default != null ? String(param.default) : undefined}
              />
            </div>
          )
        }

        // text
        const textValue = (values[param.key] as string) ?? (param.default as string) ?? ""
        return (
          <div key={param.key} className="space-y-2">
            <Label htmlFor={`param-${param.key}`}>{param.label}</Label>
            {param.description && (
              <p className="text-xs text-muted-foreground">{param.description}</p>
            )}
            <Input
              id={`param-${param.key}`}
              value={textValue}
              onChange={(e) => updateValue(param.key, e.target.value)}
              placeholder={param.default != null ? String(param.default) : undefined}
            />
          </div>
        )
      })}
    </div>
  )
}
