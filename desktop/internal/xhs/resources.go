package xhs

import (
	"embed"
	"encoding/base64"
	"fmt"
)

//go:embed resources/*.json
var resources embed.FS

func resourceObject(name string) Object {
	data, e := resources.ReadFile("resources/" + name)
	if e != nil {
		panic(e)
	}
	v, e := ParseJSON(data)
	if e != nil {
		panic(e)
	}
	o, ok := v.(Object)
	if !ok {
		panic(fmt.Sprintf("resource %s is not an object", name))
	}
	return o
}
func resourceBytes(name, key string) []byte {
	o := resourceObject(name)
	data, e := base64.StdEncoding.DecodeString(jsText(o.Get(key)))
	if e != nil {
		panic(e)
	}
	return data
}
