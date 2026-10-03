// xhscheck performs one read-only account check using a manually supplied Cookie.
package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"time"

	"github.com/cry5tallize/xhs_spider_desktop/internal/xhs"
	"github.com/joho/godotenv"
)

func run() error {
	if err := godotenv.Load(); err != nil {
		log.Println("load .env file err: ", err.Error())
	}
	cookie := os.Getenv("XHS_COOKIE")
	if cookie == "" {
		return fmt.Errorf("set XHS_COOKIE to a complete authenticated PC request Cookie")
	}
	session, e := xhs.NewSession(cookie, xhs.SessionOptions{})
	if e != nil {
		return e
	}
	transport, e := xhs.NewChromeTransport(xhs.TransportOptions{ProxyURL: os.Getenv("XHS_PROXY")})
	if e != nil {
		return e
	}
	client := xhs.NewClient(session, transport)
	defer client.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 25*time.Second)
	defer cancel()
	data, e := client.GetMe(ctx)
	if e != nil {
		return e
	}
	fmt.Printf("account check passed: user_id=%s\n", data.Get("user_id"))
	return nil
}
func main() {
	if e := run(); e != nil {
		fmt.Fprintln(os.Stderr, e)
		os.Exit(1)
	}
}
