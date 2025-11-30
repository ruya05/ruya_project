using UnityEngine;
using UnityEngine.UI;

public class PulseAnimation : MonoBehaviour
{
    private Image img;

    void Start()
    {
        img = GetComponent<Image>();
    }

    void Update()
    {
        float alpha = Mathf.PingPong(Time.time * 1.5f, 1f);
        Color c = img.color;
        c.a = 0.3f + (alpha * 0.7f);
        img.color = c;
    }
}