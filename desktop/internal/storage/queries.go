package storage

import (
	"embed"
	"io/fs"
	"strings"
	"sync"
)

//go:embed sql/migrations/*.sql sql/queries/*/*.sql
var sqlFiles embed.FS

var namedQueries = sync.OnceValue(func() map[string]string {
	paths, err := fs.Glob(sqlFiles, "sql/queries/*/*.sql")
	if err != nil {
		panic(err)
	}
	result := make(map[string]string, len(paths))
	for _, path := range paths {
		body, err := sqlFiles.ReadFile(path)
		if err != nil {
			panic(err)
		}
		name := strings.TrimSuffix(strings.TrimPrefix(path, "sql/queries/"), ".sql")
		result[name] = string(body)
	}
	return result
})

// Only storage repositories can choose SQL. Values are always bound parameters.
func query(name string) string {
	data, found := namedQueries()[name]
	if !found {
		panic("missing embedded query: " + name)
	}
	return data
}
