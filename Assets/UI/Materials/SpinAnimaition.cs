using UnityEngine;

public class SpinAnimation : MonoBehaviour
{
    public float spinSpeed = -200f;

    void Update()
    {
        transform.Rotate(0, 0, spinSpeed * Time.deltaTime);
    }
}