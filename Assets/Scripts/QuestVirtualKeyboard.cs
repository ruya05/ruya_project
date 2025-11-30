using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using TMPro;
using Microsoft.MixedReality.Toolkit.Experimental.UI;

public class QuestVirtualKeyboard : MonoBehaviour
{
    private TMP_InputField inputField;
    private bool keyboardOpen = false;

    void Start()
    {
        inputField = GetComponent<TMP_InputField>();

      
        inputField.onSelect.AddListener(x => OnInputSelected());
        inputField.onDeselect.AddListener(x => OnInputDeselected());
    }

    void OnInputSelected()
    {
        if (!keyboardOpen)
        {
            OpenKeyboard();
        }
    }

    void OnInputDeselected()
    {
        StartCoroutine(DelayedDeselect());
    }

    IEnumerator DelayedDeselect()
    {
        yield return new WaitForSeconds(0.3f);
    }

    public void OpenKeyboard()
    {
        if (NonNativeKeyboard.Instance == null)
        {
            Debug.LogError("NonNativeKeyboard.Instance is null!");
            return;
        }

        NonNativeKeyboard.Instance.OnTextUpdated += OnKeyboardTextChanged;
        NonNativeKeyboard.Instance.OnClosed += OnKeyboardClosed;

        NonNativeKeyboard.Instance.InputField = inputField;
        NonNativeKeyboard.Instance.PresentKeyboard(inputField.text);

        keyboardOpen = true;
    }

    void OnKeyboardTextChanged(string newText)
    {
        if (inputField != null)
        {

            inputField.text = newText;


            if (NonNativeKeyboard.Instance != null && NonNativeKeyboard.Instance.InputField != null)
            {
                inputField.caretPosition = NonNativeKeyboard.Instance.InputField.caretPosition;
            }
        }
    }


    void OnKeyboardClosed(object sender, System.EventArgs e)
    {

        if (NonNativeKeyboard.Instance != null)
        {
            NonNativeKeyboard.Instance.OnTextUpdated -= OnKeyboardTextChanged;
            NonNativeKeyboard.Instance.OnClosed -= OnKeyboardClosed;
        }

        keyboardOpen = false;
    }

    void OnDestroy()
    {

        if (NonNativeKeyboard.Instance != null)
        {
            NonNativeKeyboard.Instance.OnTextUpdated -= OnKeyboardTextChanged;
            NonNativeKeyboard.Instance.OnClosed -= OnKeyboardClosed;
        }
    }
}