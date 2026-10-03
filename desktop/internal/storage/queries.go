package storage

import "embed"

//go:embed sql/migrations/*.sql sql/queries/*/*.sql
var sqlFiles embed.FS

// Only storage repositories can choose SQL. Values are always bound parameters.
func query(name string) string {
	data, err := sqlFiles.ReadFile("sql/queries/" + name + ".sql")
	if err != nil {
		panic("missing embedded query: " + name)
	}
	return string(data)
}
