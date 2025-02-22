// SPDX-License-Identifier: Apache-2.0

package internal

import (
	"fmt"
	"strings"

	"github.com/open-telemetry/opentelemetry-collector-contrib/cmd/ottlplayground/internal"
)

var (
	statementsExecutors       []internal.Executor
	statementsExecutorsLookup = map[string]internal.Executor{}
)

func init() {
	for _, executor := range internal.Executors() {
		registerStatementsExecutor(executor)
	}
}

func registerStatementsExecutor(executor internal.Executor) {
	statementsExecutors = append(statementsExecutors, executor)
	statementsExecutorsLookup[executor.Metadata().ID] = executor
}

func newResult(json string, err string, logs string) map[string]any {
	v := map[string]any{
		"value": json,
		"logs":  logs,
	}
	if err != "" {
		v["error"] = err
	}
	return v
}

func NewErrorResult(err string, logs string) map[string]any {
	return newResult("", err, logs)
}

func takeObservedLogs(executor internal.Executor) string {
	all := executor.ObservedLogs().TakeAll()
	var s strings.Builder
	for _, entry := range all {
		s.WriteString(entry.ConsoleEncodedEntry())
	}
	return s.String()
}

func ExecuteStatements(config, ottlDataType, ottlDataPayload, executorName string) map[string]any {
	executor, ok := statementsExecutorsLookup[executorName]
	if !ok {
		return NewErrorResult(fmt.Sprintf("unsupported evaluator %s", executorName), "")
	}

	var output []byte
	var err error
	switch ottlDataType {
	case "logs":
		output, err = executor.ExecuteLogStatements(config, ottlDataPayload)
	case "traces":
		output, err = executor.ExecuteTraceStatements(config, ottlDataPayload)
	case "metrics":
		output, err = executor.ExecuteMetricStatements(config, ottlDataPayload)
	default:
		return NewErrorResult(fmt.Sprintf("unsupported OTLP data type %s", ottlDataType), "")
	}

	if err != nil {
		return NewErrorResult(fmt.Sprintf("unable to run %s statements. Error: %v", ottlDataType, err), takeObservedLogs(executor))
	}

	return newResult(string(output), "", takeObservedLogs(executor))
}

func StatementsExecutors() []any {
	var res []any
	for _, executor := range statementsExecutors {
		meta := executor.Metadata()
		res = append(res, map[string]any{
			"id":      meta.ID,
			"name":    meta.Name,
			"path":    meta.Path,
			"docsURL": meta.DocsURL,
			"version": meta.Version,
		})
	}
	return res
}
