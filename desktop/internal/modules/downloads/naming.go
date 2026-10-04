package downloads

import (
	"errors"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/cry5tallize/xhs_spider_desktop/internal/modules/notes"
)

var templateVariable = regexp.MustCompile(`\{([a-z_]+)\}`)
var namingVariables = map[string]bool{"note_id": true, "title": true, "author_id": true, "author_name": true, "published_date": true, "media_kind": true, "image_index": true, "codec": true, "codec_group": true, "dimensions": true, "fps": true, "variant_key": true}

func validateNaming(n Naming) error {
	for _, value := range []string{n.DirectoryTemplate, n.FileTemplate} {
		if len(value) > 512 || strings.ContainsRune(value, 0) {
			return errors.New("命名模板过长或包含无效字符")
		}
		remaining := templateVariable.ReplaceAllString(value, "")
		if strings.ContainsAny(remaining, "{}") {
			return errors.New("命名模板变量格式无效")
		}
		for _, v := range templateVariable.FindAllStringSubmatch(value, -1) {
			if !namingVariables[v[1]] {
				return errors.New("命名模板包含未知变量：" + v[1])
			}
		}
	}
	if n.DirectoryTemplate != "" {
		if !strings.Contains(n.DirectoryTemplate, "{note_id}") || filepath.IsAbs(n.DirectoryTemplate) {
			return errors.New("目录模板需要包含 {note_id}，并使用相对目录")
		}
		for _, segment := range strings.Split(strings.ReplaceAll(n.DirectoryTemplate, `\`, "/"), "/") {
			if segment == "" || segment == "." || segment == ".." {
				return errors.New("目录模板不能包含空层级或路径跳转")
			}
		}
	}
	if n.FileTemplate != "" && (!strings.Contains(n.FileTemplate, "{variant_key}") || strings.ContainsAny(n.FileTemplate, `/\`)) {
		return errors.New("文件模板需要包含 {variant_key} 且不能包含目录分隔符")
	}
	return nil
}
func renderTemplate(template string, values map[string]string) string {
	return templateVariable.ReplaceAllStringFunc(template, func(match string) string {
		key := strings.Trim(match, "{}")
		value := values[key]
		if value == "" {
			value = "unknown"
		}
		return SafeName(value, 48)
	})
}
func baseNamingValues(d notes.Detail) map[string]string {
	values := map[string]string{"note_id": d.Note.ID, "title": d.Note.Title, "author_id": d.Note.User.ID, "author_name": d.Note.User.Nickname}
	if d.Note.CreatedAtMS != nil {
		values["published_date"] = time.UnixMilli(*d.Note.CreatedAtMS).UTC().Format("2006-01-02")
	}
	return values
}
func namedDirectory(d notes.Detail, n Naming, fallback string) string {
	if n.DirectoryTemplate == "" {
		return fallback
	}
	values := baseNamingValues(d)
	parts := []string{}
	for _, segment := range strings.Split(strings.ReplaceAll(n.DirectoryTemplate, `\`, "/"), "/") {
		parts = append(parts, SafeName(renderTemplate(segment, values), 100))
	}
	id := SafeName(d.Note.ID, 28)
	if !strings.Contains(filepath.Join(parts...), id) {
		parts[len(parts)-1] += "_" + id
	}
	return filepath.Join(parts...)
}
