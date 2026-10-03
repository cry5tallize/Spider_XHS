package storage

import (
	"context"
	"database/sql"
	"errors"

	"github.com/cry5tallize/xhs_spider_desktop/internal/modules/accounts"
)

type scanner interface{ Scan(...any) error }

func scanAccount(row scanner) (accounts.Account, error) {
	var a accounts.Account
	err := row.Scan(&a.ID, &a.Name, &a.UserID, &a.Nickname, &a.Status, &a.Enabled, &a.IsDefault, &a.HasCookie, &a.CredentialVersion, &a.ValidatedAtMS, &a.LastError, &a.CreatedAtMS, &a.UpdatedAtMS)
	if errors.Is(err, sql.ErrNoRows) {
		err = accounts.ErrNotFound
	}
	return a, err
}

func (s *Store) ListAccounts(ctx context.Context) ([]accounts.Account, error) {
	rows, err := s.reader.QueryContext(ctx, query("accounts/list"))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []accounts.Account{}
	for rows.Next() {
		account, err := scanAccount(rows)
		if err != nil {
			return nil, err
		}
		result = append(result, account)
	}
	return result, rows.Err()
}

func (s *Store) GetAccount(ctx context.Context, id string) (accounts.Account, error) {
	return scanAccount(s.reader.QueryRowContext(ctx, query("accounts/get"), id))
}

func (s *Store) GetCredential(ctx context.Context, id string) (accounts.Credential, error) {
	// Read metadata and the protected blob from one SQLite snapshot.
	tx, err := s.reader.BeginTx(ctx, &sql.TxOptions{ReadOnly: true})
	if err != nil {
		return accounts.Credential{}, err
	}
	defer tx.Rollback()
	a, err := scanAccount(tx.QueryRowContext(ctx, query("accounts/get"), id))
	if err != nil {
		return accounts.Credential{}, err
	}
	result := accounts.Credential{Account: a}
	if err = tx.QueryRowContext(ctx, query("accounts/credential"), id).Scan(&result.Provider, &result.Ciphertext); err != nil {
		return result, err
	}
	return result, tx.Commit()
}

func (s *Store) CreateAccount(ctx context.Context, credential accounts.Credential) error {
	a := credential.Account
	_, err := s.writer.ExecContext(ctx, query("accounts/create"), a.ID, a.Name, credential.Ciphertext, credential.Provider, a.CreatedAtMS, a.UpdatedAtMS)
	return err
}

func accountResult(result sql.Result, err error, noRows error) error {
	if err != nil {
		return err
	}
	n, err := result.RowsAffected()
	if err == nil && n != 1 {
		return noRows
	}
	return err
}

func (s *Store) UpdateAccount(ctx context.Context, input accounts.Update, at int64) error {
	r, err := s.writer.ExecContext(ctx, query("accounts/update"), input.Name, input.Enabled, at, input.Enabled, input.Enabled, input.ID)
	return accountResult(r, err, accounts.ErrNotFound)
}

func (s *Store) ReplaceAccountCookie(ctx context.Context, id string, ciphertext []byte, provider accounts.SecretProvider, expected int64, at int64) error {
	r, err := s.writer.ExecContext(ctx, query("accounts/replace_cookie"), ciphertext, provider, at, id, expected)
	return accountResult(r, err, accounts.ErrChanged)
}

func (s *Store) SetDefaultAccount(ctx context.Context, id string, at int64) error {
	tx, err := s.writer.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err = tx.ExecContext(ctx, query("accounts/clear_default"), at); err != nil {
		return err
	}
	r, err := tx.ExecContext(ctx, query("accounts/set_default"), at, id)
	if err = accountResult(r, err, accounts.ErrDisabled); err != nil {
		return err
	}
	return tx.Commit()
}

func (s *Store) DeleteAccount(ctx context.Context, id string, at int64) error {
	r, err := s.writer.ExecContext(ctx, query("accounts/delete"), at, at, id)
	return accountResult(r, err, accounts.ErrNotFound)
}

func (s *Store) SaveAccountValidation(ctx context.Context, id string, version int64, validation accounts.Validation) error {
	r, err := s.writer.ExecContext(ctx, query("accounts/validation"), validation.Status, validation.Identity.UserID, validation.Identity.Nickname, validation.Error, validation.CheckedAtMS, validation.CheckedAtMS, id, version)
	return accountResult(r, err, accounts.ErrChanged)
}
