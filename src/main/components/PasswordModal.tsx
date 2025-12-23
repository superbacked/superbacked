import { Button, Modal, PasswordInput, Space, darken } from "@mantine/core"
import { useForm } from "@mantine/form"
import { FunctionComponent, useCallback, useEffect, useRef } from "react"
import { useTranslation } from "react-i18next"
import { Eye as EyeIcon, EyeOff as EyeOffIcon } from "tabler-icons-react"

interface PasswordModalProps {
  onClose: () => void
  onSubmit: (passphrases: string[]) => void
  unlocking: boolean
}

const PasswordModal: FunctionComponent<PasswordModalProps> = (props) => {
  const { i18n, t } = useTranslation()
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (ref.current) {
      ref.current.focus()
    }
  }, [props.unlocking])
  const form = useForm({
    initialValues: {
      passphrase: "",
      dualPassphrase: false,
    },
    validate: {
      passphrase: (value) => {
        if (value === "") {
          return t("common.passphraseRequired")
        }
        return null
      },
    },
  })
  const handleUnlock = useCallback(() => {
    const validation = form.validate()
    if (validation.hasErrors === false) {
      const passphrase = [form.values.passphrase]
      props.onSubmit(passphrase)
      form.reset()
    }
  }, [form, props])
  useEffect(() => {
    if (Object.keys(form.errors).length > 0) {
      form.validate()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i18n.language])
  return (
    <Modal
      centered
      closeOnClickOutside={false}
      onClose={() => props.onClose()}
      opened={true}
      title={`${t("components.passphraseModal.enterPassphrase")}${
        form.values.dualPassphrase === true ? "s" : ""
      }`}
      styles={{
        title: {
          fontWeight: "bold",
        },
      }}
    >
      <form onSubmit={form.onSubmit(handleUnlock)}>
        <PasswordInput
          ref={ref}
          autoFocus
          data-autofocus
          disabled={props.unlocking}
          label={t("common.passphrase")}
          placeholder={t("common.typePassphrase")}
          required
          spellCheck={false}
          visibilityToggleIcon={({ reveal }) =>
            reveal === true ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />
          }
          {...form.getInputProps("passphrase", { withFocus: false })}
        />
        <Space h="lg" />
        <Button
          disabled={props.unlocking}
          gradient={{ from: "#fdc0ee", to: "#fbd6cd", deg: 45 }}
          loading={props.unlocking}
          onClick={handleUnlock}
          variant="gradient"
          sx={{
            "&:disabled": {
              color: darken("#ffffff", 0.25),
              backgroundImage: `linear-gradient(45deg, ${darken(
                "#fdc0ee",
                0.25
              )} 0%, ${darken("#fbd6cd", 0.25)} 100%)`,
            },
          }}
        >
          {props.unlocking === true
            ? t("components.passphraseModal.unlocking")
            : t("components.passphraseModal.unlock")}
        </Button>
      </form>
    </Modal>
  )
}

export default PasswordModal
