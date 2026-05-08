{{- define "invoice.labels" -}}
app.kubernetes.io/part-of: invoice-service
{{- end -}}

{{- define "invoice.namespace" -}}
{{- .Values.namespace | default "invoice-service" -}}
{{- end -}}
